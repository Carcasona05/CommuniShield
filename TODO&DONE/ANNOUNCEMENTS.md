### USER FEATURES

# USERS TASKS DONE [Backend]

- Login and Register is done no need for hash since Supabase Auth handled it.
- Home or the Community Feed is fetching data from database
- Add Report: Image is being compressed, and everything is being POST to the database but location needed to be reconsidered.
- My reports page are fetching data and filters are working just fine. (delete and edit surely working just fine).
- Profile Details is fetching the right data and can edit data in it.
- Notification is Fetching the Your reports, Incident Reports Near Your Location and Recent Login datas correctly.
- Password and Security is Done.
- Integrate the MAP API is DONE - Added a Datbase of storing coordination than relying on leaflets and openmap.
- Credibility Score is done but only for the user's features (not included AI yet.)
- All the posts are just now

# USERS NEEDED LOGICS
- Notification turn on turn off
- Crime Alert Settings on and off

# MINOR USERS NEEDED LOGIC
- Session Key needed to be integrated for logging out and logging in. [DONE]
- need the server to be update in real time so that data feels smooth no need for refresh or relog [DONE]

# RECOMMENDATIONS AND REVISION
- Is it possible instead of IP address the name of the place will be shown [TOBECHECKED]
- Credibility Score: A user will be credible after he/she fill her/his personal details. ( put a message or something.) 


### ADMIN FEATURES

# ADMIN TASKS DONE [Backend]
- Admin Dashboard Done with data fetching.
- Analytics Done with Possible Crime forecast, Sentiment analysis, and Predictive trend Model.
- Validation Done, Viewing similar posts, Viewing sentiment from gathering comments, AI Score (no ai yet just seed data), and do actions such as reject, resolve, under verification
- Logs done with just fetching data for viewing activity from the Admins.
- Notification Returning True to Is_read being Solved and done.
- Accounst is not accessible if disabled.

# LACKS


# CONCERNS
- DASHBOARD has already map for the heatmaps of incidents, so in the Analytics what should I put? is it verified crimes or unverified. [REDUNDANT]


# SUPER ADMIN TASKS DONE
- Dashboard is [DONE]
- Validation is [DONE]
- Admin Accounts is [DONE]
- Notification is [DONE] - needed reconsideration
- Super admin profile and password [DONE]
- AI treshold config [DONE] - needed confirmation
- Map Settings [DONE] - needed confirmation
- Notification preferences [DONE]

# LACKINGS
- API and Model Settings.


# OVERALL
- Session time out if there's no account logged in and will redirected to logins.
- OTP for forget password not implemented yet.


### FRONTEND ###

## UI/UX ## [Take-Action-Immediately]

# FOR MOBILE
- USE AVOID KEYBOARD so everytime you type it will not overlapped the UI by the keyboard (JUST CALL THE FUNCTION)
- Fonts, containers, and dropdowns needed to be reconsidered. ( deploying the app will be different and may cause unresponsiveness )
- The Sign Up and Sign In clickable texts needed to be changed to buttons. ( It is not a standard reg/sign in UI )
- No go back to top after scrolling downward too much.
- MUCH BETTER TO USE TOAST FOR BETTER UI ON SUCCESS/FAIL MESSAGE


# FIXES MADE (MIKA)
- added toast in user_postreport and user_myreports
- made the posts swipable and zoomable (also fixed the layout)
- added refresh
- minor layout changes in user_home and user_settings
- added eye toggle for all password inputs 
- added password validation
- added avoid keyboard (to be checked in all ui)
- added 

# FOR DESKTOP
- The responsiveness of everything.
- In validation page: Fitler Reports - status should be reconsider if [all] really be needed.
- Dashboard has a lot of space maybe add more or just fit all contents.
- After scrolling in the validation or log there's no arrow up for the admin to go back. Or just make the Report for validation container only be scrollable. [same-goes-with-logs]
- No First name, Middle name, Last name for the editing the admins accounts. It should have those columns because every users shares the same table. [FOR_PROFILES]
- MUCH BETTER TO USE TOAST FOR BETTER UI ON SUCCESS/FAIL MESSAGE


# FIXES MADE (SCARSAN)
- Added the announcement in Admin in Admin_Violation
- added the announcement in SAdmin in Sadmin_Violation

# SUGGESTIONS
- All confirm like password, new email, and etc. Should have an interactive design. 

# LACKINGS and CORRECTION
- Add Report is nowhere to be found only add announcement. Button are existing but it opened the announcement and function name are incorrect it should be announcement not reports
- In Super Admin, View Reports is not found.
-


# MINOR ERRORS ( DOES NOT REALLY AFFECT THE SYSTEM BUT NEEDED TO BE FIXED) [-CRITICAL-]
# TO run eslint just type npx eslint .
C:\Users\Administrator\Desktop\CommuniShield\clients\app\(admin)\Admin_Settings.jsx
  29:10  error  'InfoCard' is defined but never used  @typescript-eslint/no-unused-vars

C:\Users\Administrator\Desktop\CommuniShield\clients\app\(sadmin)\SAdmin_AdminAccounts.jsx
  133:10  error  'loading' is assigned a value but never used  @typescript-eslint/no-unused-vars

C:\Users\Administrator\Desktop\CommuniShield\clients\app\(tabs)\MyUser_RepPostView_Edit.jsx
  87:14  error  'error' is defined but never used  @typescript-eslint/no-unused-vars

C:\Users\Administrator\Desktop\CommuniShield\clients\app\(tabs)\User_Home.jsx
   55:7   error  'formatDatePosted' is assigned a value but never used  @typescript-eslint/no-unused-vars
  190:10  error  'loading' is assigned a value but never used           @typescript-eslint/no-unused-vars

C:\Users\Administrator\Desktop\CommuniShield\clients\app\(tabs)\User_PostReport.jsx
  188:14  error  'error' is defined but never used         @typescript-eslint/no-unused-vars
  257:13  error  'res' is assigned a value but never used  @typescript-eslint/no-unused-vars

C:\Users\Administrator\Desktop\CommuniShield\clients\app\(tabs)\User_RepPostView.jsx
  12:12  error  'error' is defined but never used  @typescript-eslint/no-unused-vars

C:\Users\Administrator\Desktop\CommuniShield\clients\components\Admin_ViewValidation.jsx
  32:10  error  'StatusBadge' is defined but never used  @typescript-eslint/no-unused-vars

C:\Users\Administrator\Desktop\CommuniShield\clients\components\BottomNavBar.jsx
  25:9  error  'isMediumScreen' is assigned a value but never used  @typescript-eslint/no-unused-vars

C:\Users\Administrator\Desktop\CommuniShield\clients\components\ReportByAdmin.jsx
  89:9  error  'getTypeIcon' is assigned a value but never used  @typescript-eslint/no-unused-vars

C:\Users\Administrator\Desktop\CommuniShield\clients\components\ThemedHeader.jsx
  3:8  error  'Colors' is defined but never used  @typescript-eslint/no-unused-vars



### AI INTEGRATIONS ##

[STILL-WORKING-ON-IT]