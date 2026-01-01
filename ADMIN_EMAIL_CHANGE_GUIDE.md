.# Admin Email Change Guide

## 🔒 Security Status

✅ **GOOD NEWS**: Admin email is **NOT hardcoded** anywhere in the codebase. It's stored securely in the database (`admins` table).

### Where Admin Email is Stored:
- **Database**: `admins` table → `email` column
- **No hardcoded values**: All email checks are done dynamically from database
- **Secure**: Email is only used for authentication, not exposed in client-side code

### Security Features:
1. ✅ Email stored in database (Supabase)
2. ✅ Password hashed with bcrypt (10 salt rounds)
3. ✅ Rate limiting on login attempts
4. ✅ Session-based authentication (HTTP-only cookies)
5. ✅ No email exposed in frontend code

---

## 📝 How to Change Admin Email

### Method 1: Direct Database Update (Recommended)

1. **Go to Supabase Dashboard**
   - Open your Supabase project
   - Navigate to **Table Editor** → `admins` table

2. **Update Email**
   - Find your admin record
   - Click on the `email` field
   - Change to new email
   - Save

3. **Test Login**
   - Logout from admin panel
   - Login with new email and same password
   - Should work immediately

### Method 2: Using SQL Query

```sql
-- Update admin email in Supabase SQL Editor
UPDATE admins 
SET email = 'newadmin@example.com' 
WHERE email = 'oldadmin@example.com';
```

### Method 3: Using Admin Setup API (If you have setup key)

```bash
# Make a POST request to /api/admin/setup
curl -X POST http://localhost:3000/api/admin/setup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newadmin@example.com",
    "password": "your_new_password",
    "fullName": "Admin Name",
    "setupKey": "YOUR_ADMIN_SETUP_KEY"
  }'
```

**Note**: This will create a new admin if email doesn't exist, or update password if email exists.

---

## ⚠️ Important Notes

1. **Email is Login Credential**: Changing email means you'll need to use the new email to login
2. **Password Remains Same**: Only email changes, password stays the same
3. **Multiple Admins**: You can have multiple admin accounts with different emails
4. **No Code Changes Needed**: Email change is purely database operation

---

## 🔍 Verification: No Hardcoded Emails

After checking the entire codebase:
- ✅ No admin email hardcoded in source code
- ✅ All email references are from database or user input
- ✅ Login page uses placeholder text only (`admin@24fitness.com`)
- ✅ Contact email in Footer/Contact page is different (gym contact, not admin login)

---

## 🛡️ Security Best Practices

1. **Use Strong Password**: Minimum 8 characters, mix of letters, numbers, symbols
2. **Keep Setup Key Secret**: If using `/api/admin/setup`, keep `ADMIN_SETUP_KEY` in `.env.local`
3. **Regular Password Changes**: Use the password change feature in Settings
4. **Monitor Login Attempts**: Rate limiting protects against brute force
5. **Use HTTPS in Production**: Ensure secure connection

---

## 📞 Need Help?

If you need to change admin email and face any issues:
1. Check Supabase database connection
2. Verify admin record exists in `admins` table
3. Ensure `is_active` is `true` for the admin account
4. Check browser console for any errors

