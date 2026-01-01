# 🚀 QUICK TESTING GUIDE
## Step-by-Step Test Scenarios

---

## 📋 TEST SCENARIO 1: Basic Plan Purchase (No Trainer)

### Steps:
1. Go to `/membership` → Should see **only Online plans** (no In-Gym toggle)
2. Click "Select Plan" on **Basic Plan**
3. Fill membership form → Submit
4. Go to payment page → Upload payment screenshot → Submit
5. **Admin Panel**: Go to `/admin/memberships` → Find pending membership
6. Click "Approve" → ✅ **Invoice should be generated automatically**
7. **User Dashboard**: Go to `/dashboard` → Check "My Membership" section
8. ✅ **Invoice section should appear** with download button
9. Download invoice → Verify PDF contains correct details

### Expected Results:
- ✅ No in-gym panel on membership page
- ✅ Invoice generated on approval
- ✅ Invoice visible in user dashboard
- ✅ PDF downloadable

---

## 📋 TEST SCENARIO 2: Premium Plan with Trainer (1 Week Free)

### Steps:
1. Select **Premium Plan** (6 months)
2. Fill form → Submit payment
3. **Admin Panel**: Approve membership
4. Admin assigns trainer (Premium includes 1 week free trainer)
5. ✅ **Invoice should include plan + trainer**
6. **User Dashboard**: Check trainer info displayed
7. ✅ **User can message trainer** (messaging enabled)

### Expected Results:
- ✅ Trainer assigned automatically on approval (or admin assigns)
- ✅ Invoice includes trainer access
- ✅ Messaging enabled between user and trainer
- ✅ Trainer period shows 1 week duration

---

## 📋 TEST SCENARIO 3: Elite Plan with Trainer Choice (1 Month Free)

### Steps:
1. Select **Elite Plan** (12 months)
2. User can choose trainer (or admin assigns)
3. Fill form → Submit payment
4. **Admin Panel**: Approve → Assign trainer
5. ✅ **Invoice generated** with plan + trainer
6. **User Dashboard**: Verify 1 month trainer access

### Expected Results:
- ✅ 1 month free trainer access included
- ✅ Invoice generated correctly
- ✅ Messaging enabled

---

## 📋 TEST SCENARIO 4: In-Gym Addon (Online Plan + In-Gym)

### Steps:
1. Select **Online Basic Plan**
2. On payment page → ✅ **Check "In-Gym Add-On" checkbox**
3. Submit payment (should include ₹1200 admission fee)
4. **Admin Panel**: Approve membership
5. ✅ **Invoice should include**: Plan price + ₹1200 admission fee
6. **User Dashboard**: Check addons section → In-Gym Access should show

### Expected Results:
- ✅ In-gym addon available on payment page
- ✅ ₹1200 admission fee included in invoice
- ✅ In-gym access shown in user dashboard
- ✅ Monthly fee (₹650) payable at gym (not in invoice)

---

## 📋 TEST SCENARIO 5: Trainer Addon (Basic Plan + Trainer)

### Steps:
1. User has **Basic Plan** (no trainer)
2. **User Dashboard**: Add trainer addon
3. Select trainer → Submit request
4. **Admin Panel**: Go to trainer addons section
5. Approve trainer addon → Assign trainer
6. ✅ **Invoice generated** for trainer addon
7. **User Dashboard**: Check trainer info → Messaging enabled

### Expected Results:
- ✅ Trainer addon requires admin approval
- ✅ Invoice generated on approval
- ✅ Messaging enabled after assignment
- ✅ Trainer period shows correct duration

---

## 📋 TEST SCENARIO 6: Membership Renewal (New Flow)

### Steps:
1. User has **active membership** (expiring in 4 days)
2. **User Dashboard**: ✅ **Warning card appears**: "Your membership will expire in 4 days"
3. Card shows: "To renew your plan, please contact the admin through the Contact Page"
4. User goes to `/contact` → Sends message: "I want to renew my membership"
5. **Admin Panel**: Go to `/admin/messages` → Open user's message
6. ✅ **"Renew Membership" button** visible
7. Admin clicks "Renew Membership"
8. ✅ **Invoice generated immediately**
9. ✅ **User receives confirmation message** in chat
10. **User Dashboard**: Check membership extended + new invoice

### Expected Results:
- ✅ No "Renew Now" button on dashboard
- ✅ Warning card directs to Contact Page
- ✅ Admin can renew via chat thread
- ✅ Invoice generated on renewal
- ✅ User notified

---

## 📋 TEST SCENARIO 7: Trainer Renewal (New Flow)

### Steps:
1. User has **active trainer** (expiring in 4 days)
2. **User Dashboard**: ✅ **Warning card appears**: "Your trainer access will expire in 4 days"
3. User contacts admin via Contact Page
4. **Admin Panel**: Open chat thread
5. ✅ **"Renew Trainer" button** visible (if trainer assigned)
6. Admin clicks "Renew Trainer"
7. ✅ **Invoice generated immediately**
8. ✅ **User receives confirmation**

### Expected Results:
- ✅ Trainer renewal via Contact Page
- ✅ Invoice generated
- ✅ Trainer period extended

---

## 📋 TEST SCENARIO 8: Expired Membership

### Steps:
1. User has **expired membership**
2. **User Dashboard**: ✅ **Expired card appears**: "Your membership expired X days ago"
3. Card shows: "To renew your plan, please contact the admin through the Contact Page"
4. ✅ **Membership removed from active list**
5. User contacts admin → Admin renews → Invoice generated

### Expected Results:
- ✅ Expired card shown
- ✅ Membership not in active list
- ✅ Renewal via Contact Page works

---

## 📋 TEST SCENARIO 9: Expired Trainer Access

### Steps:
1. User has **expired trainer access**
2. **User Dashboard**: ✅ **Expired card appears**: "Your trainer access expired"
3. ✅ **Trainer removed from user** (messaging disabled)
4. ✅ **Admin and trainer receive notifications**
5. User contacts admin → Admin renews trainer → Invoice generated

### Expected Results:
- ✅ Trainer removed when expired
- ✅ Messaging disabled
- ✅ Notifications sent
- ✅ Renewal works

---

## 📋 TEST SCENARIO 10: Trainer Panel - Unread Message Dot

### Steps:
1. **Trainer Login**: Go to `/trainer`
2. ✅ **No notification bell** visible
3. ✅ **Dot indicator** on "Messages" nav item (if unread messages)
4. Go to Messages → Read messages
5. ✅ **Dot disappears** when all read

### Expected Results:
- ✅ No notification bell
- ✅ Dot shows unread count
- ✅ Dot updates in real-time

---

## 📋 TEST SCENARIO 11: Trainer Panel - Clients

### Steps:
1. **Trainer Login**: Go to `/trainer/clients`
2. ✅ **Only assigned clients** visible
3. ✅ **No clients from other trainers**
4. Can remove client → Client removed from list + messaging disabled

### Expected Results:
- ✅ Only own clients visible
- ✅ Remove client works
- ✅ Messaging disabled after removal

---

## 📋 TEST SCENARIO 12: Training Page (Public)

### Steps:
1. Go to `/trainers` (public page, no login)
2. ✅ **Section 1**: Gym owner details displayed
3. ✅ **Section 2**: All trainers displayed
4. ✅ **No messaging buttons** on trainer cards
5. **Admin Panel**: Go to `/admin/gym-owner` → Edit owner details
6. **Admin Panel**: Go to `/admin/trainers` → Toggle `online_training` / `in_gym_training`
7. Refresh `/trainers` page → ✅ Changes reflected

### Expected Results:
- ✅ Gym owner section visible
- ✅ All trainers listed
- ✅ No messaging buttons
- ✅ Admin can edit details
- ✅ Training options toggleable

---

## 📋 TEST SCENARIO 13: Messaging Rules

### User ↔ Trainer:
- [ ] ✅ User can message trainer **only if** trainer assigned + active
- [ ] ✅ Trainer can message user **only if** assigned + active
- [ ] ✅ Messaging disabled if trainer not assigned
- [ ] ✅ Messaging disabled if trainer expired

### User ↔ Admin:
- [ ] ✅ User can always message admin (Contact Page)
- [ ] ✅ Admin can always message user
- [ ] ✅ Real-time messaging works

---

## 📋 TEST SCENARIO 14: Notifications

### Test Each Notification:
- [ ] ✅ New message received
- [ ] ✅ Admin accepts trainer addon
- [ ] ✅ Admin declines trainer addon
- [ ] ✅ Admin accepts membership
- [ ] ✅ Admin declines membership
- [ ] ✅ Trainer assigned
- [ ] ✅ Membership expiring soon (4 days)
- [ ] ✅ Trainer expiring soon (4 days)
- [ ] ✅ Membership expired
- [ ] ✅ Trainer expired

---

## 📋 TEST SCENARIO 15: Invoice System

### Test Invoice Generation:
- [ ] ✅ Invoice generated on membership approval
- [ ] ✅ Invoice generated on trainer addon approval
- [ ] ✅ Invoice generated on membership renewal
- [ ] ✅ Invoice generated on trainer renewal
- [ ] ✅ All invoices stored in database
- [ ] ✅ All invoices have PDF files
- [ ] ✅ Invoice numbers unique and sequential
- [ ] ✅ Invoice download works
- [ ] ✅ Invoice shows correct details (amount, dates, plan, trainer)

---

## 🐛 COMMON ISSUES TO CHECK

### 1. Invoice Generation
- ❌ Invoice not generated → Check console logs, verify API route
- ❌ PDF not created → Check Supabase Storage permissions
- ❌ Invoice not visible → Check RLS policies

### 2. Renewal Buttons
- ❌ Buttons not visible → Check membership status, verify API
- ❌ Renewal fails → Check console logs, verify database updates

### 3. Messaging
- ❌ User can't message trainer → Check trainer assignment status
- ❌ Messages not real-time → Check Supabase channel subscriptions

### 4. Notifications
- ❌ Notifications not received → Check notification channels
- ❌ Wrong notifications → Check notification logic

### 5. Trainer Panel
- ❌ Dot not showing → Check `useTrainerUnreadCount` hook
- ❌ Wrong clients shown → Check trainer_id filter

---

## ✅ FINAL CHECKLIST

Before marking as complete, verify:

- [ ] All old renewal system removed
- [ ] Invoice system working for all payment types
- [ ] Membership plans logic correct
- [ ] In-gym as addon working
- [ ] Renewal via Contact Page working
- [ ] All notifications working
- [ ] Admin panel clean and functional
- [ ] Trainer panel clean and functional
- [ ] Training page displays correctly
- [ ] No console errors
- [ ] No unused code
- [ ] Production-ready

---

**Happy Testing! 🎉**

