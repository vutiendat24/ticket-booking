# System Design — Concert Ticket Booking Platform

## 1. Overview & Business Context

This document covers the architecture decisions, database design, concurrency strategy, and scope of the Concert Ticket Booking Platform — a backend system designed to handle a flash sale event with ~50,000 users and 300–500 booking requests per minute.

---

## 2. Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Clients                                 │
│         Customer App          Internal Operation Dashboard      │
└────────────────┬──────────────────────────┬────────────────────┘
                 │                          │
                 ▼                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                   NestJS REST API (Port 3000)                   │
│                                                                 │
│  /concerts/*          /bookings/*        /vouchers/*            │
│  /admin/concerts/*    /admin/bookings/*  /admin/vouchers/*      │
│                                                                 │
│  ┌────────────┐  ┌─────────────────┐  ┌──────────────────┐     │
│  │  Concerts  │  │    Bookings     │  │    Vouchers      │     │
│  │  Module    │  │    Module       │  │    Module        │     │
│  └────────────┘  └───────┬─────────┘  └──────────────────┘     │
│                          │                                      │
└──────────────────────────┼──────────────────────────────────────┘
                           │
           ┌───────────────┼──────────────────┐
           ▼               ▼                  ▼
    ┌─────────────┐  ┌──────────┐    ┌──────────────────┐
    │ PostgreSQL  │  │  Redis   │    │  (Future) Queue  │
    │ (Primary    │  │  Lock /  │    │  RabbitMQ / SQS  │
    │  DB)        │  │  Cache)  │    │                  │
    └─────────────┘  └──────────┘    └──────────────────┘
```

### Why a Monolith (not Microservices)?

Given the scope (single team, initial launch, 2-day timeline), a **modular monolith** is the right choice:
- Simpler to develop, test, and debug
- Lower operational overhead
- Can be split into microservices later by extracting modules (already cleanly bounded)
- NestJS modules act as natural bounded contexts

---

## 3. Database Design

### ERD (Entity Relationship)

```
concerts
  ├── id (PK, UUID)
  ├── name, venue, eventDate, status, artist, genre
  └── ──< ticket_categories (1:N)
             ├── id (PK, UUID)
             ├── concertId (FK)
             ├── name, price
             ├── totalQuantity
             ├── soldQuantity         ← key: modified atomically on booking
             └── ──< booking_items (1:N)
                        ├── id (PK)
                        ├── bookingId (FK)
                        ├── ticketCategoryId (FK)
                        ├── quantity, unitPrice, subtotal

bookings
  ├── id (PK, UUID)
  ├── customerName, customerEmail, customerPhone
  ├── status (PENDING | PAID | CANCELLED | FAILED)
  ├── totalAmount, discountAmount, finalAmount
  ├── voucherId (FK, nullable)
  ├── idempotencyKey (UNIQUE INDEX, nullable)  ← prevents duplicate bookings
  ├── failureReason
  └── ──< booking_items (1:N)

vouchers
  ├── id (PK, UUID)
  ├── code (UNIQUE)
  ├── discountType (PERCENTAGE | FIXED_AMOUNT)
  ├── discountValue, maxDiscountAmount, minOrderAmount
  ├── totalLimit, usedCount              ← incremented atomically
  ├── validFrom, validUntil
  └── isActive
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| `soldQuantity` column on `ticket_categories` | Fast availability check without COUNT(*) query on booking_items each time |
| `idempotencyKey` UNIQUE index on `bookings` | Database-level guarantee against duplicate bookings |
| Price snapshot on `booking_items.unitPrice` | Preserves price at time of purchase — future price changes don't affect historical bookings |
| `UUID` for all PKs | Avoids sequential ID guessing, safe for distributed future use |
| `synchronize: true` (dev only) | Easy local setup; switch to TypeORM migrations for production |

---

## 4. Concurrency Strategy (Flash Sale)

This is the most critical part of the system. Three layers of protection prevent overselling:

### Layer 1: Redis Distributed Lock (Application Layer)

```
Client A: POST /bookings (category X, qty 5)
Client B: POST /bookings (category X, qty 5)   ← concurrent

Redis:
  SET lock:ticket_category:<X> <token> PX 10000 NX
  → Client A: OK (acquires lock)
  → Client B: fails, retries with exponential backoff

Only Client A proceeds to the DB transaction.
Client B waits and retries (up to 10 attempts, ~1s total).
```

**Why Redis + DB lock?**
- Redis lock reduces load on the database — most concurrent requests are serialized before touching Postgres
- Fast to acquire/release (microseconds vs. database round-trips)
- Fallback to DB lock handles Redis failure cases

### Layer 2: PostgreSQL Pessimistic Lock (Database Layer)

```sql
-- Inside the transaction:
SELECT * FROM ticket_categories
WHERE id IN (...)
FOR UPDATE;  -- row-level lock
```

- Hard guarantee: even if Redis fails, two transactions cannot simultaneously modify the same row
- TypeORM: `.setLock('pessimistic_write')` on the query builder

### Layer 3: Idempotency Key (Client Layer)

```
Client: POST /bookings with idempotencyKey: "order-abc-123"
Server: Check if booking with this key exists
  → If YES: return existing booking (no-op)
  → If NO: proceed with new booking creation

On retry (same key): safe, returns same result
```

**Why all three?**

| Problem | Solution |
|---------|----------|
| 500 concurrent requests for 10 remaining tickets | Redis lock serializes them |
| Redis is down or lock expires early | DB pessimistic lock is the safety net |
| Network timeout causes client to retry | Idempotency key prevents double booking |

---

## 5. Booking State Machine

```
         ┌──────────┐
         │ PENDING  │  ← initial state (tickets reserved)
         └────┬─────┘
      ┌───────┼────────────┐
      ▼       ▼            ▼
  ┌──────┐ ┌──────────┐ ┌────────┐
  │ PAID │ │CANCELLED │ │ FAILED │
  └──┬───┘ └──────────┘ └───┬────┘
     │    (terminal)        │
     ▼                      ▼
 ┌──────────┐          ┌──────────┐
 │CANCELLED │          │CANCELLED │
 └──────────┘          └──────────┘
```

**Inventory Release Rules:**
- `PENDING → CANCELLED`: inventory is released (soldQuantity decremented)
- `PAID → CANCELLED`: inventory is NOT automatically released (requires manual ops decision)
- `FAILED → CANCELLED`: no inventory to release (booking never fully completed)

---

## 6. API Design

### Route Convention

| Prefix | Audience |
|--------|----------|
| `/concerts/*`, `/bookings/*`, `/vouchers/*` | Customer-facing |
| `/admin/*` | Internal operations dashboard |

### Customer APIs

| Method | Path | Description |
|--------|------|-------------|
| GET | `/concerts` | Browse published concerts (paginated) |
| GET | `/concerts/:id` | View concert + ticket categories |
| GET | `/concerts/:id/availability` | Real-time ticket availability |
| POST | `/bookings` | Reserve tickets (idempotent) |
| GET | `/bookings/:id` | Track booking status |
| GET | `/vouchers/validate/:code` | Preview voucher discount |

### Admin APIs

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/concerts` | List all concerts (all statuses) |
| POST | `/admin/concerts` | Create concert (DRAFT) |
| PATCH | `/admin/concerts/:id/status` | Publish / cancel concert |
| POST | `/admin/concerts/:id/ticket-categories` | Add ticket category |
| GET | `/admin/bookings` | List bookings with filters |
| PATCH | `/admin/bookings/:id/status` | Manually update booking status |
| GET | `/admin/dashboard/stats` | Revenue and booking stats by status |
| POST | `/admin/vouchers` | Create voucher campaign |
| GET | `/admin/vouchers` | List all vouchers |

---

## 7. Voucher Design

### Discount Calculation

**PERCENTAGE:**
```
discount = (orderAmount × discountValue%) 
         → capped at maxDiscountAmount (if set)
```

**FIXED_AMOUNT:**
```
discount = min(discountValue, orderAmount)  ← never negative
```

### Abuse Prevention

- `usedCount` is incremented atomically **within the same DB transaction** as the booking
- `SELECT FOR UPDATE` on the voucher row prevents concurrent requests from both reading `usedCount = 99` and both proceeding when `totalLimit = 100`

---

## 8. Assumptions & Scope

### What Is Implemented

- Browse concerts and view ticket categories
- Reserve tickets (idempotent, concurrent-safe with Redis + DB locks)
- Apply vouchers (atomic usage tracking)
- Track booking status
- Admin: Create/publish concerts, add ticket categories
- Admin: List bookings with filters (status, email)
- Admin: Manually update booking status with state machine validation
- Admin: Dashboard stats (count + revenue by status)
- Admin: Create voucher campaigns
- Auto-seed demo data on first boot
- Unit tests (BookingsService, VouchersService — 13 tests)
- Swagger API documentation at `/api/docs`
- Postman collection (`postman-collection.json`)

### What Is NOT Implemented (Out of Scope)

| Feature | Reason / Notes |
|---------|---------------|
| Authentication / Authorization | Would use JWT guards on `/admin/*`. Omitted to focus on core business logic. |
| Payment gateway integration | Bookings stay PENDING until an admin manually marks them PAID |
| Email notifications | Would use a queue (RabbitMQ/SQS) + email service in production |
| Rate limiting | Would add `@nestjs/throttler` in production |
| Update/delete vouchers | Create-only by design. Simplifies audit trail. |
| Update concert details | Status change is sufficient for the demo scope |
| Metrics / Tracing | Would use Prometheus + OpenTelemetry in production |
| DB Migrations | Using `synchronize: true` for local dev. Production uses TypeORM migrations. |
| Ticket transfer / refund flows | Complex domain logic — scoped out |

---

## 9. What I Would Do Differently in Production

1. **Authentication**: JWT with role-based guards on all `/admin/*` routes
2. **Async payment**: Queue-based system — booking created → event published → payment service processes → webhook updates booking status
3. **Read replicas**: Heavy read traffic (browsing concerts) routed to read replica; writes to primary
4. **Redis caching**: Cache published concert list and availability (invalidated on booking/admin update)
5. **DB migrations**: Replace `synchronize: true` with TypeORM migration files
6. **Rate limiting**: Per-IP and per-user throttling on booking endpoint
7. **Monitoring**: Prometheus metrics on booking throughput, lock contention, error rates
8. **Multi-node Redis**: Redlock algorithm across 3+ Redis nodes for true distributed locking
