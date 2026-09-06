Changes Made 9/6/2026

- Doubled admin notifications — filtered by user_id
- Audit logs empty — added insertAuditLog to all admin actions
- Admin report creation — added role column, controller now populates it
- Announcement modal not closing — fixed shared handler bug
- "Mark as Fake" not working — wired end-to-end (frontend → backend → DB)
- Mark as Fake red styling — fixed status string match
- Hooks crash on reload — moved early returns after all hooks in 6 files
- Stale token routing — startup now validates token before routing