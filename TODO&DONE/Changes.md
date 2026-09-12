Changes Made 9/6/2026

- Doubled admin notifications — filtered by user_id
- Audit logs empty — added insertAuditLog to all admin actions
- Admin report creation — added role column, controller now populates it
- Announcement modal not closing — fixed shared handler bug
- "Mark as Fake" not working — wired end-to-end (frontend → backend → DB)
- Mark as Fake red styling — fixed status string match
- Hooks crash on reload — moved early returns after all hooks in 6 files
- Stale token routing — startup now validates token before routing


Session 1: User Feature Toast Implementation
Toast.jsx
- Updated paddingTop from 56 to 80 for higher positioning
User Auth Pages
- User_Login.jsx - Wrapped with ToastProvider, toast for login success/error, forgot password validation
- User_Register.jsx - Wrapped with ToastProvider, toast for register success/error
- SendOTP.jsx - Wrapped with ToastProvider, toast for OTP verification, password reset
User Feature Pages
- User_ProfileSettings.jsx - Wrapped with ToastProvider, toast for profile save success/error, password change success/error
- User_Settings.jsx - Wrapped with ToastProvider, toast for logout + confirmation modal
- User_PostReport.jsx - Already had ToastProvider (no changes)
- MyUser_RepPostView.jsx - Already had ToastProvider (no changes)
- MyUser_RepPostView_Edit.jsx - Already had ToastProvider (no changes)
- User_MyReports.jsx - Already had ToastProvider (no changes)

Session 2: Admin Feature Toast + Confirmation Modals
Toast.jsx Redesigned for Desktop
- Mobile: centered at top, paddingTop: 80, width: 88%
- Desktop (width >= 768): top-left position, 380px width, subtle shadows
- Success: #294880 (brand blue) with checkmark
- Error: #E45757 (danger red) with alert icon
Admin Auth
- Admin_Login.jsx - Wrapped with ToastProvider, toast for login success/error, forgot password flow
Admin Pages
- Admin_Settings.jsx - Wrapped with ToastProvider, replaced Alert.alert/showMessage with toast
- Admin_Validation.jsx - Wrapped with ToastProvider, replaced Alert.alert with toast
- Admin_AddReportModal.jsx - Wrapped with ToastProvider, replaced Alert.alert with toast
- SAdmin_AdminAccounts.jsx - Wrapped with ToastProvider, replaced Alert.alert/showMessage with toast + delete confirmation modal
Admin Layouts (Logout Toast + Confirmation Modals)
- Admin_Layout.jsx - Wrapped with ToastProvider, toast on logout + confirmation modal
- SAdmin_Layout.jsx - Wrapped with ToastProvider, toast on logout + confirmation modal
Deleted
- InlineBanner.jsx - Removed (was temporary, replaced with Toast)

Session 3: Platform Guards (Web Restrictions)
Mobile Routes Blocked on Web
- User_Login.jsx - Redirects to admin dashboard/login on web, returns null
- User_Register.jsx - Redirects to admin dashboard/login on web, returns null
- _layout.jsx (tabs) - Redirects to admin dashboard/login on web, returns null
Logic
- Checks user_role from localStorage
- If super_admin → redirects to SAdmin_Dashboard
- If admin → redirects to Admin_Dashboard
- If no token/regular user → redirects to Admin_Login