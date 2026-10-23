/** Lets a mounted editor veto non-link actions that leave the admin, such as signing out. */
export const ADMIN_BEFORE_LEAVE_EVENT = "gp-admin:before-leave";

export function requestAdminLeave() {
  return window.dispatchEvent(new Event(ADMIN_BEFORE_LEAVE_EVENT, { cancelable: true }));
}
