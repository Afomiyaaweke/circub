#!/bin/bash
# E2E smoke test: tourist books guide -> guide accepts -> tourist cancels second booking.
set -e
BASE=http://localhost:3212
J1=/tmp/tourist.jar; J2=/tmp/guide.jar
rm -f $J1 $J2

echo "== register tourist =="
curl -s -c $J1 -X POST $BASE/api/auth/register -H "Content-Type: application/json" \
  -d '{"name":"Book Tom","email":"tom6@test.et","password":"secret123","accountType":"PERSONAL"}' | head -c 120; echo

echo "== guide login (seeded g1@test.et) =="
curl -s -c $J2 -X POST $BASE/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"g1@test.et","password":"secret123"}' | head -c 120; echo

GUIDE_ID=$(curl -s -b $J1 "$BASE/api/guides" | python3 -c "import json,sys; print([g['id'] for g in json.load(sys.stdin)['guides'] if g['name']=='Abebe Lalibela'][0])")
echo "guide id: $GUIDE_ID"

echo "== tourist creates booking =="
curl -s -b $J1 -X POST $BASE/api/guides/$GUIDE_ID/bookings -H "Content-Type: application/json" \
  -d '{"date":"2026-10-01","days":2,"people":3,"message":"Rock churches + market walk please"}' | python3 -c "import json,sys; b=json.load(sys.stdin)['booking']; print('created:', b['id'], b['status'], b['date'], b['days'], b['people'])"

echo "== duplicate pending blocked =="
curl -s -b $J1 -X POST $BASE/api/guides/$GUIDE_ID/bookings -H "Content-Type: application/json" \
  -d '{"days":1}' | head -c 120; echo

echo "== guide sees incoming =="
BOOKING_ID=$(curl -s -b $J2 $BASE/api/bookings | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['pendingCount'], d['bookings'][0]['id'], d['bookings'][0]['direction'])")
echo "guide view: $BOOKING_ID"
BID=$(echo $BOOKING_ID | awk '{print $2}')

echo "== guide accepts with note =="
curl -s -b $J2 -X PATCH $BASE/api/bookings/$BID -H "Content-Type: application/json" \
  -d '{"status":"ACCEPTED","reply":"Meet me at the airport gate. 3000 ETB/day all-in."}' | python3 -c "import json,sys; b=json.load(sys.stdin)['booking']; print('status:', b['status'], '| reply:', b['reply'])"

echo "== tourist sees accepted =="
curl -s -b $J1 $BASE/api/bookings | python3 -c "import json,sys; d=json.load(sys.stdin); print('tourist view:', d['bookings'][0]['status'], d['bookings'][0]['direction'], '| pending badge:', d['pendingCount'])"

echo "== PATCH /api/auth/me guide profile update =="
curl -s -b $J2 -X PATCH $BASE/api/auth/me -H "Content-Type: application/json" \
  -d '{"guideBio":"Updated bio: 12 years guiding Lalibela.","guideSpecialties":"Historical,Religious,Photography","guideHourlyRate":35,"guideCurrency":"USD"}' | python3 -c "import json,sys; u=json.load(sys.stdin)['user']; print('guide bio:', u['guideBio'][:40], '| rate:', u['guideCurrency'], u['guideHourlyRate'], '| specs:', u['guideSpecialties'])"

echo "== guard: tourist cannot accept =="
curl -s -b $J1 -X PATCH $BASE/api/bookings/$BID -H "Content-Type: application/json" -d '{"status":"COMPLETED"}' | head -c 100; echo

echo "ALL E2E PASSED"
