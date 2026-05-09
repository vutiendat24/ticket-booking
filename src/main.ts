import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Reduce startup noise in production
    logger:
      process.env.NODE_ENV === 'production'
        ? ['error', 'warn', 'log']
        : ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  // ── Global Prefix ───────────────────────────────────────────────────────────
  app.setGlobalPrefix('api');

  // ── Global Pipes ─────────────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,              // Strip unknown properties
      forbidNonWhitelisted: true,   // Throw 400 on unknown properties (prevent injection)
      transform: true,              // Auto-transform types (e.g., string → number for @Query)
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ── Global Exception Filter ───────────────────────────────────────────────
  // Standardizes all error responses and hides stack traces from clients
  app.useGlobalFilters(new HttpExceptionFilter());

  // ── Global Response Interceptor ────────────────────────────────────────────
  // Wraps all success responses: { success: true, data: ..., timestamp: ... }
  app.useGlobalInterceptors(new ResponseInterceptor());

  // ── CORS ────────────────────────────────────────────────────────────────────
  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') ?? '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // ── Swagger / OpenAPI ───────────────────────────────────────────────────────
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Concert Ticket Booking Platform API')
      .setDescription(
        `
## Overview
Backend API for a Concert Ticket Booking Platform. Supports high-traffic flash sales,
customer-facing booking flows, and an internal operation dashboard.

## API Groups
- **Concerts** — Browse published concerts, check availability; Admin: create, publish, manage ticket categories
- **Bookings** — Reserve tickets (idempotent, concurrent-safe), track status; Admin: list, update status, dashboard stats
- **Vouchers** — Validate voucher codes; Admin: create campaigns, list vouchers

## Concurrency Strategy
Flash sale traffic handled via two-layer protection:
1. **Redis distributed lock** (per ticket category) — fast path, reduces DB contention
2. **PostgreSQL pessimistic lock** (SELECT FOR UPDATE) — hard guarantee against overselling
3. **Idempotency key** — client-provided key prevents duplicate bookings on retry

## Response Format
All responses are wrapped:
\`\`\`json
{ "success": true, "data": { ... }, "timestamp": "2026-05-09T..." }
\`\`\`
Errors:
\`\`\`json
{ "statusCode": 400, "error": "Bad Request", "message": "...", "path": "/api/...", "timestamp": "..." }
\`\`\`
      `,
      )
      .setVersion('1.0')
      .addTag('Concerts', 'Concert browsing and management')
      .addTag('Bookings', 'Ticket reservation and tracking')
      .addTag('Vouchers', 'Promotional voucher management')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
    });
  }

  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port, '0.0.0.0');

  const baseUrl = `http://localhost:${port}`;
  console.log(`\n🎵  Concert Ticket Platform running at: ${baseUrl}/api`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`📚  Swagger API Docs: ${baseUrl}/docs\n`);
  }
}

bootstrap().catch((err) => {
  console.error('Fatal: Failed to start application', err);
  process.exit(1);
});
