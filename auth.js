class GitHubAuth {
  constructor() {
    this.organizations = [];
    document
      .getElementById("clearDataButton")
      ?.addEventListener("click", () => this.clearAllData());

    document.getElementById("saveToken").addEventListener("click", async () => {
      await this.handleTokenSubmit();
    });
    // @TODO auth err event
  }

  async handleTokenSubmit() {
    const tokenInput = document.getElementById("githubToken");
    const token = tokenInput.value.trim();

    if (!token) {
      this.showError("Please enter a valid GitHub token");
      return;
    }

    this.showLoading("Validating token...");
    localStorage.setItem("github_token", token);

    try {
      await window.githubAPI.getUserOrganizations();

      tokenInput.value = "";
      this.hideError();
      window.org.show();
    } catch (error) {
      localStorage.removeItem("github_token");
      this.hideLoading();
      this.showError(
        "Invalid GitHub token. Please check your token and try again.",
      );
    }
  }

  hide() {
    document.getElementById("tokenStep")?.classList.add("hidden");
  }

  show() {
    window.org.hide();
    window.main.hide();
    document.getElementById("tokenStep")?.classList.remove("hidden");
  }

  showError(message) {
    const errorDiv = document.getElementById("authError");
    if (errorDiv) {
      errorDiv.textContent = message;
      errorDiv.style.display = "block";
    }
  }

  hideError() {
    const errorDiv = document.getElementById("authError");
    if (errorDiv) {
      errorDiv.style.display = "none";
    }
  }

  showLoading(message) {
    const loadingDiv = document.getElementById("authLoading");
    if (loadingDiv) {
      loadingDiv.textContent = message;
      loadingDiv.style.display = "block";
    }
  }

  hideLoading() {
    const loadingDiv = document.getElementById("authLoading");
    if (loadingDiv) {
      loadingDiv.style.display = "none";
    }
  }

  get token() {
    return localStorage.getItem("github_token");
  }
}

window.auth = new GitHubAuth();
