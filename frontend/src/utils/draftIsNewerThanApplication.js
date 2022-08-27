/**
 * Check if an application has been submitted and if it matches the locally stored draft
 * @param {*} myApplication The already submitted application
 * @return boolean
 */
const draftIsNewerThanApplication = (myApplication) => {
  if (!myApplication) return true;
  if (!sessionStorage.getItem("phoneNumber")) return false;

  const phoneNumber = sessionStorage.getItem("phoneNumber");
  if (myApplication.phone_number !== phoneNumber) return true;
  const text = sessionStorage.getItem("text");
  if (myApplication.text !== text) return true;
  const selectedGroups = JSON.parse(sessionStorage.getItem("selectedGroups"));
  const _groupApplications = {};
  const groupApplications = Object.entries(
    JSON.parse(sessionStorage.getItem("applicationText"))
  )
    .filter(
      ([groupName]) => groupName in selectedGroups && selectedGroups[groupName]
    )
    .map(
      ([groupName, groupText]) => (_groupApplications[groupName] = groupText)
    );
  if (
    myApplication.group_applications.length !==
    Object.keys(groupApplications).length
  )
    return true;
  let isChanged = false;
  myApplication.group_applications.forEach((groupApplication) => {
    if (
      groupApplication.text !==
      _groupApplications[groupApplication.group.name.toLowerCase()]
    )
      isChanged = true;
  });
  return isChanged;
};

export default draftIsNewerThanApplication;
