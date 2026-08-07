/*
|--------------------------------------------------------------------------
| Account Deletion Policy
|--------------------------------------------------------------------------
|
| A deletion request is never immediate. The default grace period gives the
| account holder time to contact support before the scheduler can begin the
| irreversible deletion workflow.
|
*/

export const ACCOUNT_DELETION_POLICY = {
  DEFAULT_GRACE_PERIOD_DAYS: 30,
  MAXIMUM_GRACE_PERIOD_DAYS: 90,
} as const;
