// Initialize the dashboard when the page loads
document.addEventListener("DOMContentLoaded", () => {
  if (!localStorage.getItem("github_token")) {
    console.log("No GitHub token found, showing token step.");
    window.auth.show();
    return;
  }
  console.log("GitHub token found.");

  if (!window.org.selectedOrganization) {
    console.log("No organization selected, showing organization step.");
    window.org.show();
    return;
  }
  console.log("Organization selected:", window.org.selectedOrganization);
  window.main.show(window.org.selectedOrganization);
});

window.addEventListener("organizationChanged", (event) => {
  const orgName = event.detail.organization;
  const url = new URL(window.location);
  if (orgName) {
    url.searchParams.set("org", orgName);
  } else {
    url.searchParams.delete("org");
  }
  window.history.pushState({}, "", url);
  window.main.show(orgName);
});

// Refresh when tab comes back into focus
document.addEventListener("visibilitychange", () => {
  console.log("Visibility changed. hidden:", document.hidden);
  if (document.hidden) {
    return;
  }
  const organization = window.org.selectedOrganization;
  if (organization) {
    window.main.show(organization);
  }
});
