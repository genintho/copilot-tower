class GitHubOrgOrg {
  constructor() {}

  updateOrganizationUI() {
    const orgList = document.getElementById("orgList");
    window.githubAPI.getUserOrganizations().then((orgs) => {
      orgList.innerHTML = "";
      orgs.forEach((org) => {
        const orgItem = document.createElement("div");
        orgItem.className = "org-item";
        orgItem.onclick = () => {
          window.dispatchEvent(
            new CustomEvent("organizationChanged", {
              detail: { organization: org.login },
            }),
          );
        };
        orgItem.innerHTML = `
                <input type="radio" name="organization" class="js-org-elem" onchange="">
                <label for="org-${org.login}">
                    <img src="${org.avatar_url}" alt="${org.login}" class="org-avatar">
                    <div class="org-info">
                        <strong>${org.login}</strong>
                        ${org.description ? `<p>${org.description}</p>` : ""}
                    </div>
                </label>
            `;
        orgList.appendChild(orgItem);
      });
    });
  }

  hide() {
    document.getElementById("orgStep")?.classList.add("hidden");
  }

  show() {
    document.getElementById("orgStep")?.classList.remove("hidden");
    this.updateOrganizationUI();
  }

  get selectedOrganization() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get("org");
  }
}

window.org = new GitHubOrgOrg();
