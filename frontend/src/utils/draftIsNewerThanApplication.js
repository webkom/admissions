import { getDraftUpdatedAt } from "src/utils/draftHelper";

/**
 * Check if an application has been submitted and if it matches the locally stored draft
 * @param {*} myApplication The already submitted application
 * @return boolean
 */
const draftIsNewerThanApplication = (myApplication) => {
  if (!myApplication) return true;
  const draftUpdatedAt = getDraftUpdatedAt();
  const myApplicationUpdatedAt = new Date(myApplication.updated_at);
  if (!draftUpdatedAt) return false;
  return myApplicationUpdatedAt < draftUpdatedAt;
};

export default draftIsNewerThanApplication;
