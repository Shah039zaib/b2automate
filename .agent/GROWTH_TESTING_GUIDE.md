# GROWTH & MARKETING — TESTING GUIDE (Roman Urdu)

B2Automate ke analytics, pixel, aur coupon features test karne ke liye yeh guide follow karein.

---

## 📊 GOOGLE ANALYTICS (GA4) TESTING

### Step 1: Admin Panel Mein Enable Karein
1. Admin app kholein: `http://localhost:5174`
2. Login karein (Super Admin)
3. Left menu se "Growth" par click karein
4. "Google Analytics (GA4)" section dekho

### Step 2: GA4 Configure Karein
1. Toggle switch ON karein (green)
2. "Measurement ID" field mein apna ID daalein
   - Format: `G-XXXXXXXXXX`
   - Yeh Google Analytics se milega
3. "Save Changes" button dabayein
4. Success message aana chahiye

### Step 3: Verify Karein
1. Web app kholein: `http://localhost:5173`
2. Browser DevTools kholein (F12)
3. Network tab mein filter: "gtag" ya "googletagmanager"
4. Agar GA enabled hai → script load hoga
5. Agar disabled hai → koi script NAHI load hoga

### Development Note
⚠️ Development mode mein GA script NAHI load hota — yeh intentional hai.
Production mein test karne ke liye build karein aur serve karein.

---

## 📱 FACEBOOK / META PIXEL TESTING

### Step 1: Admin Panel Se Enable
1. Admin app mein "Growth" page jao
2. "Facebook / Meta Pixel" section
3. Toggle ON karein
4. Pixel ID daalein: `123456789012345`
5. Save karein

### Step 2: Verify Karein
1. Web app kholein
2. DevTools → Network → filter "facebook" ya "fbevents"
3. Enabled hone par → script load hoga
4. Disabled → kuch NAHI load hoga

---

## 🏷️ COUPON BANNER TESTING

### Step 1: Coupon Create Karein (Admin)
1. Admin app → "Growth" page
2. "Promotional Banner" section
3. Toggle ON karein
4. Fields bharein:
   - **Coupon Code**: `WINTER25`
   - **Stripe Coupon ID**: `WINTER25` (Stripe dashboard se match hona chahiye)
   - **Discount Type**: Percentage
   - **Discount Value**: 25
   - **Banner Message**: `🎉 Get 25% off with code WINTER25!`
   - **Expiry**: Optional
5. "Save Changes" click karein

### Step 2: Banner Dekho
1. Web app kholein: `http://localhost:5173`
2. Landing page par upar purple banner dikhega
3. `/pricing` page par bhi banner hoga
4. Banner mein:
   - Message dikhega
   - Coupon code badge hoga (click to copy)
   - Close (X) button hoga

### Step 3: Coupon Close Karein
1. Banner ka X button dabao
2. Banner gayab ho jayega
3. Page refresh se wapas aayega

### Step 4: Stripe Checkout Test
1. Pricing page jao
2. Kisi paid plan ka "Subscribe" button dabao
3. Stripe Checkout page khulega
4. **VERIFY**: Coupon AUTOMATICALLY apply hona chahiye
5. Discount amount dikhna chahiye

### Step 5: Disable Test
1. Admin mein "Promotional Banner" toggle OFF karein
2. Save karein
3. Web app refresh karein
4. **VERIFY**: Banner NAHI dikhna chahiye
5. DOM mein bhi banner element NAHI hona chahiye

---

## ✅ QUICK CHECKLIST

### GA4
- [ ] Toggle ON → script loads
- [ ] Toggle OFF → NO script
- [ ] Measurement ID saved correctly

### Facebook Pixel
- [ ] Toggle ON → pixel loads
- [ ] Toggle OFF → NO pixel

### Coupon Banner
- [ ] Enable → banner shows on Landing
- [ ] Enable → banner shows on Pricing
- [ ] Coupon code clickable (copies)
- [ ] Close button works
- [ ] Checkout → coupon auto-applies
- [ ] Disable → banner completely gone

---

## 🎨 UI CONSISTENCY CHECK

Yeh ensure karein:
- [ ] Admin panel purple theme consistent
- [ ] Web app purple theme consistent
- [ ] Buttons same style everywhere
- [ ] Cards same shadow/border
- [ ] No visual inconsistency

---

## 🔧 TROUBLESHOOTING

### Banner Nahi Dikh Raha
1. Check: Admin mein coupon enabled hai?
2. Check: Coupon expiry guzar nahi gaya?
3. Check: Page refresh kiya?

### Analytics Script Nahi Load
1. Check: Development mode mein expected hai
2. Check: Browser AdBlocker disable karein
3. Check: Network tab mein filter correct hai?

### Checkout Mein Coupon Nahi Apply Hua
1. Check: Stripe Dashboard mein coupon exist karta hai?
2. Check: Coupon ID admin mein match karta hai?
3. Check: localStorage clear karein aur retry

---

**Testing Complete Hone Par**:
"🎨 Growth & Brand Systems Live — Analytics, Coupons & UI Fully Unified."
