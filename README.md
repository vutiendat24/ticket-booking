# Concert Ticket Booking Platform

A backend system for a Concert Ticket Booking Platform supporting customer-facing booking flows and an internal Operation Dashboard.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20+ |
| Framework | NestJS 11 (TypeScript) |
| Database | PostgreSQL 15 |
| Cache / Lock | Redis 7 |
| ORM | TypeORM 0.3 |
| API Docs | Swagger / OpenAPI |
| Testing | Jest |
| Container | Docker Compose |

---

## Quick Start

### Prerequisites

- Node.js 20+
- Docker & Docker Compose

### 1. Clone & Install

```bash
git clone <repo>
cd ticket-platform
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env if needed (defaults work with the docker-compose setup)
```

### 3. Start Infrastructure

```bash
docker-compose up -d
```

This starts:
- **PostgreSQL** on `localhost:5432`
- **Redis** on `localhost:6379`

### 4. Run the Application

```bash
npm run start:dev
```

The app auto-creates tables (`synchronize: true`) and seeds demo data on first boot.

### 5. API Documentation

Open: **http://localhost:3000/api/docs**

---

## Demo Seed Data

On first boot, the application automatically seeds:

### Concerts
| Name | Status | Categories |
|------|--------|-----------|
| Coldplay Music Of The Spheres World Tour – Hanoi | PUBLISHED | VIP Diamond (5M), VIP Gold (3M), Standard (1.5M), Early Bird (1M) |
| Son Tung MTP Summer Concert 2026 | DRAFT | — |

### Vouchers
| Code | Type | Value | Min Order | Limit |
|------|------|-------|-----------|-------|
| `LAUNCH2026` | PERCENTAGE | 10% (max 200k off) | 1,000,000 | 1000 |
| `FLASHSALE500` | FIXED | 500,000 off | 2,000,000 | 200 |
| `VIP15` | PERCENTAGE | 15% (max 750k off) | 5,000,000 | 50 |

---

## Running Tests

```bash
# All unit tests
npm test

# With coverage
npm run test:cov
```

---

## How to Add a New API (Coding Convention)

1. **Create DTO** in `src/modules/<feature>/dto/<action>.dto.ts`
   - Use `class-validator` decorators for validation
   - Use `@ApiProperty` for Swagger documentation

2. **Add service method** in `src/modules/<feature>/<feature>.service.ts`
   - Business logic lives here
   - Throw `NotFoundException`, `BadRequestException`, `ConflictException` for expected errors

3. **Add controller route** in `src/modules/<feature>/<feature>.controller.ts`
   - Use NestJS route decorators
   - Add `@ApiOperation`, `@ApiQuery`, `@ApiParam` for docs
   - Prefix admin routes with `/admin/`

4. **Write a unit test** in `<feature>.service.spec.ts`
   - Mock all repositories and external services
   - Test happy path + error cases

---

## Project Structure

```
src/
├── entities/                  # TypeORM entities (DB schema)
│   ├── concert.entity.ts
│   ├── ticket-category.entity.ts
│   ├── booking.entity.ts
│   ├── booking-item.entity.ts
│   └── voucher.entity.ts
├── modules/
│   ├── concerts/              # Concert management
│   │   ├── dto/
│   │   ├── concerts.controller.ts
│   │   ├── concerts.service.ts
│   │   └── concerts.module.ts
│   ├── bookings/              # Booking flow (core)
│   │   ├── dto/
│   │   ├── bookings.controller.ts
│   │   ├── bookings.service.ts
│   │   ├── bookings.service.spec.ts
│   │   └── bookings.module.ts
│   ├── vouchers/              # Voucher management
│   │   ├── dto/
│   │   ├── vouchers.controller.ts
│   │   ├── vouchers.service.ts
│   │   ├── vouchers.service.spec.ts
│   │   └── vouchers.module.ts
│   └── redis/                 # Distributed lock
│       ├── redis-lock.service.ts
│       └── redis.module.ts
├── database/
│   └── seeder.service.ts      # Auto-seed on startup
├── app.module.ts
└── main.ts
```
"# ticket-booking" 
