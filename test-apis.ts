import { randomUUID } from 'crypto';

const BASE_URL = 'http://localhost:3000/api';

async function runTest() {
  console.log('🚀 Starting E2E API tests...');
  let hasError = false;

  const assert = (condition: boolean, message: string) => {
    if (!condition) {
      console.error(`❌ FAILED: ${message}`);
      hasError = true;
    } else {
      console.log(`✅ PASSED: ${message}`);
    }
  };

  try {
    // 1. GET /api/concerts
    console.log('\n--- Testing Concerts API ---');
    const concertsRes = await fetch(`${BASE_URL}/concerts`);
    const concertsBody = await concertsRes.json();
    assert(concertsRes.status === 200, `GET /api/concerts returned ${concertsRes.status}`);
    assert(concertsBody.success === true, 'GET /api/concerts is wrapped in success payload');
    assert(concertsBody.data.data.length > 0, 'At least one concert exists');

    const concert = concertsBody.data.data[0];
    const ticketCategory = concert.ticketCategories[0];
    const concertId = concert.id;
    const ticketCategoryId = ticketCategory.id;

    // 2. GET /api/concerts/:id/availability
    const availRes = await fetch(`${BASE_URL}/concerts/${concertId}/availability`);
    const availBody = await availRes.json();
    assert(availRes.status === 200, `GET /api/concerts/:id/availability returned ${availRes.status}`);
    assert(availBody.data.concertId === concertId, 'Availability returns correct concert ID');

    // 3. GET /api/vouchers/validate/:code
    console.log('\n--- Testing Vouchers API ---');
    const voucherRes = await fetch(`${BASE_URL}/vouchers/validate/LAUNCH2026`);
    const voucherBody = await voucherRes.json();
    assert(voucherRes.status === 200, `GET /api/vouchers/validate/LAUNCH2026 returned ${voucherRes.status}`);
    assert(voucherBody.data.code === 'LAUNCH2026', 'Voucher is valid and returned');

    // 4. POST /api/bookings
    console.log('\n--- Testing Bookings API ---');
    const idempotencyKey = randomUUID();
    const bookingPayload = {
      customerName: 'Test User',
      customerEmail: 'test@example.com',
      customerPhone: '0901234567',
      items: [
        {
          ticketCategoryId: ticketCategoryId,
          quantity: 2,
        },
      ],
      voucherCode: 'LAUNCH2026',
      idempotencyKey: idempotencyKey,
      notes: 'Automated test booking',
    };

    const bookRes = await fetch(`${BASE_URL}/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bookingPayload),
    });
    const bookBody = await bookRes.json();
    assert(bookRes.status === 201, `POST /api/bookings returned ${bookRes.status}`);
    assert(bookBody.success === true, 'Booking successful');
    assert(bookBody.data.id !== undefined, 'Booking returned an ID');
    
    const bookingId = bookBody.data.id;

    // 5. POST /api/bookings (Idempotency check)
    const bookRes2 = await fetch(`${BASE_URL}/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bookingPayload),
    });
    const bookBody2 = await bookRes2.json();
    assert(bookRes2.status === 201, `POST /api/bookings (Idempotent) returned ${bookRes2.status}`);
    assert(bookBody2.data.id === bookingId, 'Idempotent request returned the exact same booking');

    // 6. GET /api/bookings/:id
    const getBookRes = await fetch(`${BASE_URL}/bookings/${bookingId}`);
    const getBookBody = await getBookRes.json();
    assert(getBookRes.status === 200, `GET /api/bookings/:id returned ${getBookRes.status}`);
    assert(getBookBody.data.status === 'PENDING', 'Booking status is PENDING initially');

    // 7. PATCH /api/bookings/:id/status (Admin)
    const patchBookRes = await fetch(`${BASE_URL}/bookings/${bookingId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'PAID' }),
    });
    const patchBookBody = await patchBookRes.json();
    assert(patchBookRes.status === 200, `PATCH /api/bookings/:id/status returned ${patchBookRes.status}`);
    assert(patchBookBody.data.status === 'PAID', 'Booking status updated to PAID');

    // 8. GET /api/bookings/admin/list
    console.log('\n--- Testing Admin APIs ---');
    const adminListRes = await fetch(`${BASE_URL}/bookings/admin/list?page=1&limit=5`);
    const adminListBody = await adminListRes.json();
    assert(adminListRes.status === 200, `GET /api/bookings/admin/list returned ${adminListRes.status}`);
    assert(Array.isArray(adminListBody.data.data), 'Admin list returns an array of bookings');

    // 9. GET /api/bookings/admin/stats
    const statsRes = await fetch(`${BASE_URL}/bookings/admin/stats`);
    const statsBody = await statsRes.json();
    assert(statsRes.status === 200, `GET /api/bookings/admin/stats returned ${statsRes.status}`);
    assert(Array.isArray(statsBody.data), 'Admin stats returns an array');

  } catch (err: any) {
    console.error('❌ Exception thrown during testing:', err.message);
    hasError = true;
  }

  if (hasError) {
    console.error('\n🔴 Some tests failed. Please review the output above.');
    process.exit(1);
  } else {
    console.log('\n🟢 All API tests passed perfectly! The system is fully operational.');
  }
}

runTest();
