# 🔐 Signup & Login Updates - Complete Guide

## ✅ Changes Made

### 1. **Signup Page Updates**

#### Added Fields:
- ✅ **Mobile Number** - Required field (10 digits)
- ✅ **Confirm Password** - Required field (must match password)

#### Current Signup Fields:
1. Full Name ✅
2. Mobile Number ✅ (NEW)
3. Email ✅
4. Password ✅
5. Confirm Password ✅ (NEW)

#### Validations Added:
- Password must match confirm password
- Password minimum 6 characters
- Phone number must be exactly 10 digits
- Phone number only accepts numbers (auto-filtered)

---

### 2. **Login Page Updates**

#### Changed:
- ✅ Label changed from "Email" to **"Email/Number"**
- ✅ Input type changed to `text` (to accept both email and phone)
- ✅ Placeholder: "Email or Phone Number"

#### Login Logic:
- User can login with:
  - **Email** (existing functionality)
  - **Phone Number** (NEW - 10 digits)
- System automatically detects if input is email or phone
- If phone number, queries database to find associated email
- Then logs in with that email

---

## 📁 Files Modified

### 1. `src/components/Auth/AuthForm.tsx`
**Changes:**
- Added `phone` state
- Added `confirmPassword` state
- Added mobile number input field (signup only)
- Added confirm password input field (signup only)
- Updated email label to "Email/Number" (login mode)
- Updated email input type to `text` (login mode)
- Added phone validation
- Added password match validation
- Updated signup logic to save phone in profiles table
- Updated login logic to support phone number login

### 2. `src/app/api/auth/get-email-by-phone/route.ts` (NEW FILE)
**Purpose:**
- API route to get user email by phone number
- Used for phone number login
- Queries profiles table → finds user id → gets email from auth.users

---

## 🗄️ Database Changes

### ✅ **NO DATABASE CHANGES NEEDED!**

**Why?**
- `profiles` table already has `phone` column ✅
- Phone field is already in the schema
- No new tables or columns needed

**Current `profiles` table structure:**
```sql
- id (uuid, primary key)
- full_name (text, nullable)
- phone (text, nullable) ✅ Already exists!
- avatar_url (text, nullable)
- date_of_birth (date, nullable)
- ... (other fields)
```

**What happens:**
- During signup, phone number is saved to `profiles.phone`
- During login with phone, system queries `profiles` table by phone
- Gets user id, then fetches email from `auth.users`

---

## 🔄 How It Works

### Signup Flow:
```
1. User fills form:
   - Full Name
   - Mobile Number (10 digits)
   - Email
   - Password
   - Confirm Password

2. Validations:
   - Password matches confirm password
   - Password >= 6 characters
   - Phone = 10 digits

3. Create account:
   - Supabase Auth creates user (email + password)
   - Profile created/updated with:
     - full_name
     - phone (10 digits, cleaned)

4. Success → Switch to login mode
```

### Login Flow (Email):
```
1. User enters email + password
2. Direct login via Supabase Auth
3. Success → Redirect to home
```

### Login Flow (Phone):
```
1. User enters phone number (10 digits) + password
2. System detects it's a phone number
3. API call: /api/auth/get-email-by-phone
   - Query profiles table by phone
   - Get user id
   - Get email from auth.users
4. Login with email + password
5. Success → Redirect to home
```

---

## 🧪 Testing Checklist

### Signup Tests:
- [ ] Full Name field appears
- [ ] Mobile Number field appears (signup only)
- [ ] Email field appears
- [ ] Password field appears
- [ ] Confirm Password field appears (signup only)
- [ ] Phone accepts only numbers
- [ ] Phone limited to 10 digits
- [ ] Password validation works
- [ ] Confirm password match validation works
- [ ] Signup creates profile with phone number
- [ ] Phone saved correctly in database

### Login Tests:
- [ ] Label shows "Email/Number" (not just "Email")
- [ ] Placeholder shows "Email or Phone Number"
- [ ] Login with email works (existing)
- [ ] Login with phone number works (NEW)
- [ ] Error message if phone not found
- [ ] Error message if wrong password

---

## 📝 Important Notes

### Phone Number Format:
- **Stored as:** 10 digits only (no spaces, dashes, etc.)
- **Example:** `9876543210`
- **Input:** Auto-filters to numbers only
- **Validation:** Exactly 10 digits required

### Email/Phone Detection:
- If input contains only digits (10 digits) → Treated as phone
- Otherwise → Treated as email
- Phone detection: `/^[0-9]{10}$/` pattern

### Security:
- Phone number lookup is server-side (API route)
- Uses service role key (secure)
- No phone numbers exposed in client code
- Password never transmitted for phone lookup

---

## 🐛 Troubleshooting

### Issue: Phone number not saving
**Check:**
- Phone field is required in form
- Phone validation passes (10 digits)
- Profile upsert succeeds
- Check browser console for errors

### Issue: Login with phone not working
**Check:**
- Phone number exists in profiles table
- Phone number is exactly 10 digits (no spaces)
- API route `/api/auth/get-email-by-phone` is accessible
- Check network tab for API errors

### Issue: "No account found with this phone number"
**Possible causes:**
- Phone number not saved during signup
- Phone number format mismatch
- User doesn't exist

**Solution:**
- Verify phone in profiles table
- Ensure phone is saved as 10 digits (no formatting)

---

## ✅ Summary

**What Changed:**
1. ✅ Signup: Added mobile number + confirm password
2. ✅ Login: Changed to Email/Number (supports both)
3. ✅ Created API route for phone-to-email lookup
4. ✅ Added validations for phone and password

**Database:**
- ✅ NO CHANGES NEEDED
- Phone column already exists in profiles table

**Files Modified:**
- `src/components/Auth/AuthForm.tsx`
- `src/app/api/auth/get-email-by-phone/route.ts` (NEW)

**Ready to Test!** 🎉

