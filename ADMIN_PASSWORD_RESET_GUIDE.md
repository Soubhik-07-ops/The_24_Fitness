
# Admin Password Reset Guide

## 🔐 Agar Admin Password Bhul Jaye To Kya Karein?

Agar admin apna password bhul jaye, to **direct Supabase database se password reset** kar sakte hain. Ye sabse simple aur reliable method hai.

---

## ✅ Method 1: Supabase Dashboard Se Password Reset (Recommended)

### Step-by-Step:

1. **Supabase Dashboard Kholo**
   - Apne Supabase project mein jao
   - **Table Editor** → `admins` table select karo

2. **Admin Record Find Karo**
   - Apni admin email se record find karo
   - Ya phir `id` se find karo

3. **New Password Hash Generate Karo**
   - **SQL Editor** mein jao
   - Neeche diya hua SQL query run karo (apna password set karo)

```sql
-- Step 1: Naya password hash generate karo
-- Ye query run karo (apna password "NEW_PASSWORD" ki jagah likho)
-- Password hash automatically generate ho jayega

UPDATE admins 
SET password_hash = crypt('NEW_PASSWORD', gen_salt('bf', 10))
WHERE email = 'admin@example.com';
```

**Ya phir Node.js script se hash generate karo:**

```javascript
// password-hash-generator.js
const bcrypt = require('bcryptjs');

async function generateHash() {
    const password = 'YOUR_NEW_PASSWORD';
    const hash = await bcrypt.hash(password, 10);
    console.log('Password Hash:', hash);
    // Is hash ko copy karo aur Supabase mein use karo
}

generateHash();
```

4. **Supabase Table Editor Mein Update Karo**
   - `admins` table mein jao
   - Apni admin record find karo
   - `password_hash` field mein naya hash paste karo
   - Save karo

5. **Test Karo**
   - Admin panel se logout karo
   - Naye password se login karo
   - Kaam karna chahiye!

---

## ✅ Method 2: Admin Setup API Use Karke (Agar Setup Key Ho)

Agar aapke paas `ADMIN_SETUP_KEY` hai (`.env.local` mein), to API se directly password reset kar sakte ho:

```bash
# POST request to /api/admin/setup
curl -X POST http://localhost:3000/api/admin/setup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "NEW_PASSWORD",
    "fullName": "Admin Name",
    "setupKey": "YOUR_ADMIN_SETUP_KEY"
  }'
```

**Note**: Ye method existing admin ka password update kar deta hai (agar email match kare).

---

## ✅ Method 3: SQL Query Se Direct Update

Supabase SQL Editor mein ye query run karo:

```sql
-- Option 1: Bcrypt extension use karke (agar available ho)
UPDATE admins 
SET password_hash = crypt('NEW_PASSWORD', gen_salt('bf', 10))
WHERE email = 'admin@example.com';

-- Option 2: Agar bcrypt extension nahi hai, to pehle hash generate karo
-- Node.js script se hash generate karo (upar wala code)
-- Phir directly hash update karo:

UPDATE admins 
SET password_hash = '$2a$10$GENERATED_HASH_HERE'
WHERE email = 'admin@example.com';
```

---

## 🛠️ Password Hash Generate Karne Ke Liye Script

### Node.js Script:

```javascript
// generate-password-hash.js
const bcrypt = require('bcryptjs');

const password = 'YOUR_NEW_PASSWORD';

bcrypt.hash(password, 10)
    .then(hash => {
        console.log('\n✅ Password Hash Generated:');
        console.log(hash);
        console.log('\n📋 Copy this hash and paste in Supabase admins table → password_hash field\n');
    })
    .catch(err => {
        console.error('Error:', err);
    });
```

**Run karo:**
```bash
node generate-password-hash.js
```

---

## 🔍 Verification Steps

Password reset ke baad verify karo:

1. ✅ Supabase mein `password_hash` field update ho gaya hai
2. ✅ Admin panel se logout karo
3. ✅ Naye password se login karo
4. ✅ Login successful hona chahiye

---

## ⚠️ Important Security Notes

1. **Strong Password Use Karo**
   - Minimum 8 characters
   - Mix of letters, numbers, symbols
   - Example: `MyGym@2024!`

2. **Password Hash Directly Copy-Paste Mat Karo**
   - Hash ko manually type mat karo
   - Copy-paste karo to avoid errors

3. **Old Password Delete Mat Karo**
   - Password reset ke baad old password ko safely delete karo
   - Kisi ko share mat karo

4. **Multiple Admins**
   - Agar multiple admins hain, to sirf affected admin ka password reset karo
   - Doosre admins affect nahi honge

---

## 🚀 Future Enhancement: Password Reset Feature

Agar aap chahte ho ki future mein password reset feature ho (email verification ke through), to ye features add kar sakte hain:

1. **Forgot Password Page**
   - Admin login page par "Forgot Password?" link
   - Email verification code bhejna
   - Code verify karke password reset

2. **Email-Based Reset**
   - Reset link email mein bhejna
   - Link click karke password reset

3. **Security Questions**
   - Security questions add karna
   - Answers verify karke password reset

**Current Status**: Abhi ye features nahi hain, lekin future mein add kar sakte hain.

---

## 📋 Quick Reference

### Password Reset Steps (Summary):

1. **Supabase Dashboard** → Table Editor → `admins` table
2. **Admin record find karo** (email se)
3. **Password hash generate karo** (Node.js script se)
4. **password_hash field update karo** (naya hash paste karo)
5. **Save karo**
6. **Naye password se login karo**

---

## 🆘 Emergency Access

Agar aap completely locked out ho (password bhul gaye aur Supabase access bhi nahi hai), to:

1. **Database Backup Check Karo**
   - Agar backup hai, to restore kar sakte ho
   
2. **New Admin Account Banao**
   - Admin Setup API use karke naya admin account banao
   - Naye email se login karo
   - Purane admin ko deactivate karo

3. **Developer/Support Contact Karo**
   - Agar aap developer ko contact kar sakte ho
   - Unse password reset karwa sakte ho

---

## ✅ Summary

**Current Solution:**
- ✅ Supabase database se directly password reset kar sakte ho
- ✅ Admin Setup API use kar sakte ho (agar setup key ho)
- ✅ SQL query se update kar sakte ho

**Future Enhancement:**
- 🔄 Email-based password reset (future feature)
- 🔄 Forgot password page (future feature)
- 🔄 Security questions (future feature)

**Bottom Line:**
Agar password bhul jaye, to **Supabase database se directly reset** kar sakte ho. Ye sabse reliable method hai aur koi code changes ki zaroorat nahi hai!

