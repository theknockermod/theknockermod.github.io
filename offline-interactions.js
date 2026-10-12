(function () {
  "use strict";

  const defaults = window.OFFLINE_PAGE_CONFIG || {};
  const saved = JSON.parse(localStorage.getItem("offline-page-config") || "{}");
  const config = Object.assign({}, defaults, saved);

  const normalize = (value) => (value || "").replace(/\s+/g, " ").trim();
  const findByText = (selector, text) =>
    Array.from(document.querySelectorAll(selector)).find((el) => normalize(el.textContent) === text);

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return config.fileSize;
    const units = ["B", "KiB", "MiB", "GiB"];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit += 1;
    }
    return `${value.toFixed(unit > 1 ? 2 : 0)} ${units[unit]}`;
  }

  function relativeAge(dateValue) {
    const time = new Date(dateValue).getTime();
    if (!Number.isFinite(time)) return config.releaseAge;
    const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
    if (seconds < 60) return "just now";
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }

  async function loadGithubRelease() {
    const repo = (config.githubRepo || "").trim();
    if (!repo) {
      window.offlineGithubState = { status: "empty", message: "GitHub deposu ayarlanmamış." };
      return;
    }
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
      window.offlineGithubState = { status: "error", message: "Depo biçimi kullanıcı/depo olmalı." };
      return;
    }

    window.offlineGithubState = { status: "loading", message: "GitHub sürümü yükleniyor…" };
    try {
      const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
        headers: {
          "Accept": "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28"
        }
      });
      if (!response.ok) throw new Error(`GitHub API ${response.status}`);
      const release = await response.json();
      const jars = (release.assets || []).filter((asset) => /\.jar$/i.test(asset.name || ""));
      const versionNeedle = String(config.gameVersion || "").toLowerCase();
      const loaderNeedle = String(config.loader || "").toLowerCase();
      const asset =
        jars.find((item) => item.name.toLowerCase().includes(versionNeedle) && item.name.toLowerCase().includes(loaderNeedle)) ||
        jars.find((item) => item.name.toLowerCase().includes(loaderNeedle)) ||
        jars.find((item) => item.name.toLowerCase().includes(versionNeedle)) ||
        jars[0];
      if (!asset) throw new Error("Son GitHub sürümünde .jar dosyası yok.");

      config.downloadFileUrl = asset.browser_download_url;
      config.fileName = asset.name;
      config.fileSize = formatBytes(asset.size);
      config.versionTitle = release.name || release.tag_name || config.gameVersion;
      config.releaseAge = relativeAge(release.published_at || release.created_at);
      window.offlineGithubState = { status: "ready", message: `${repo} bağlandı.`, release, asset };
      window.offlineDownloadControls?.updateModal();
    } catch (error) {
      window.offlineGithubState = { status: "error", message: error.message || "GitHub bağlantısı kurulamadı." };
      window.offlineDownloadControls?.updateModal();
    }
  }

  function toast(message) {
    let el = document.querySelector(".offline-toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "offline-toast";
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add("is-visible");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove("is-visible"), 2200);
  }

  function createOverlay(className, innerHtml) {
    const overlay = document.createElement("div");
    overlay.className = "offline-overlay " + className;
    overlay.hidden = true;
    overlay.innerHTML = '<section class="offline-dialog" role="dialog" aria-modal="true">' + innerHtml + "</section>";
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay || event.target.closest("[data-offline-close]")) overlay.hidden = true;
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") overlay.hidden = true;
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  function setupDownload() {
    const button = findByText("button", "Download");
    if (!button) return;
    button.id = "offline-download-button";

    const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
    let labelNode = null;
    while (walker.nextNode()) {
      if (normalize(walker.currentNode.textContent) === "Download") {
        labelNode = walker.currentNode;
        break;
      }
    }
    const applyLabel = () => {
      if (labelNode) labelNode.textContent = " " + config.downloadButtonLabel;
      else button.setAttribute("aria-label", config.downloadButtonLabel);
    };
    applyLabel();

    const modal = createOverlay("offline-download-modal", `
      <div class="offline-download-header">
        <div class="offline-download-heading">
          <img data-project-icon alt="The Knocker">
          <h2 data-download-title></h2>
        </div>
        <button class="offline-icon-button" type="button" data-offline-close aria-label="Kapat">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="offline-download-body">
        <div class="offline-install-row">
          <a class="offline-install-app" data-install-app>
            <svg class="offline-modrinth-mark" viewBox="0 0 590 591" aria-hidden="true"><g fill="currentColor"><path d="m29 424.4 188.2-112.95-17.15-45.48 53.75-55.21 67.93-14.64 19.67 24.21-31.32 31.72-27.3 8.6-19.52 20.05 9.56 26.6 19.4 20.6 27.36-7.28 19.47-21.38 42.51-13.47 12.67 28.5-43.87 53.78-73.5 23.27-32.97-36.7L55.06 467.94C46.1 456.41 35.67 440.08 29 424.4Zm543.03-230.25-149.5 40.32c8.24 21.92 10.95 34.8 13.23 49l149.23-40.26c-2.38-15.94-6.65-32.17-12.96-49.06Z"/><path d="M51.28 316.13c10.59 125 115.54 223.3 243.27 223.3 96.51 0 180.02-56.12 219.63-137.46l48.61 16.83c-46.78 101.34-149.35 171.75-268.24 171.75C138.6 590.55 10.71 469.38 0 316.13h51.28ZM.78 265.24C15.86 116.36 141.73 0 294.56 0c162.97 0 295.28 132.31 295.28 295.28 0 26.14-3.4 51.49-9.8 75.63l-48.48-16.78a244.28 244.28 0 0 0 7.15-58.85c0-134.75-109.4-244.15-244.15-244.15-124.58 0-227.49 93.5-242.32 214.11H.8Z"/><path d="M293.77 153.17c-78.49.07-142.2 63.83-142.2 142.34 0 78.56 63.79 142.34 142.35 142.34 3.98 0 7.93-.16 11.83-.49l14.22 49.76a194.65 194.65 0 0 1-26.05 1.74c-106.72 0-193.36-86.64-193.36-193.35 0-106.72 86.64-193.35 193.36-193.35 2.64 0 5.28.05 7.9.16l-8.05 50.85Zm58.2-42.13c78.39 24.67 135.3 97.98 135.3 184.47 0 80.07-48.77 148.83-118.2 178.18l-14.17-49.55c48.08-22.85 81.36-71.89 81.36-128.63 0-60.99-38.44-113.07-92.39-133.32l8.1-51.15Z"/></g></svg>
            <span>Install with Modrinth App</span>
          </a>
        </div>
        <div class="offline-manual-divider">Download manually</div>
        <div class="offline-select-row">
          <div class="offline-select-wrap">
            <button class="offline-select-button" type="button" data-version-select><span data-game-version></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></button>
            <div class="offline-select-menu" data-version-menu hidden><button type="button" data-version-choice>1.20.4</button></div>
          </div>
          <div class="offline-select-wrap">
            <button class="offline-select-button" type="button" data-loader-select><span data-loader></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></button>
            <div class="offline-select-menu" data-loader-menu hidden><button type="button" data-loader-choice>Forge</button></div>
          </div>
        </div>
        <div class="offline-release-row" data-release-row hidden>
          <div class="offline-version-main">
            <div class="offline-version-title-line"><strong data-version-title></strong><span class="offline-release-badge" data-version-channel></span></div>
            <div class="offline-version-meta"><span data-release-age></span><span>•</span><span data-file-size></span></div>
          </div>
          <button class="offline-version-download" type="button" data-download-file><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 16v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"/></svg><span>Download</span></button>
        </div>
      </div>
    `);
    let selectedVersion = "";
    let selectedLoader = "";
    const versionLabel = modal.querySelector("[data-game-version]");
    const loaderLabel = modal.querySelector("[data-loader]");
    const releaseRow = modal.querySelector("[data-release-row]");
    const syncSelection = () => {
      versionLabel.textContent = selectedVersion || "Select game version";
      loaderLabel.textContent = selectedLoader || "Select platform";
      modal.querySelector("[data-version-select]").classList.toggle("is-selected", !!selectedVersion);
      modal.querySelector("[data-loader-select]").classList.toggle("is-selected", !!selectedLoader);
      releaseRow.hidden = !(selectedVersion && selectedLoader);
    };
    const resetSelection = () => {
      selectedVersion = "";
      selectedLoader = "";
      modal.querySelector("[data-version-menu]").hidden = true;
      modal.querySelector("[data-loader-menu]").hidden = true;
      syncSelection();
    };
    const updateModal = () => {
      modal.querySelector("[data-project-icon]").src = config.projectIcon;
      modal.querySelector("[data-download-title]").textContent = config.downloadDialogTitle;
      modal.querySelector("[data-install-app]").removeAttribute("href");
      modal.querySelector("[data-install-app]").setAttribute("aria-disabled", "true");
      modal.querySelector("[data-version-title]").textContent = config.versionTitle;
      modal.querySelector("[data-version-channel]").textContent = config.releaseChannel;
      modal.querySelector("[data-release-age]").textContent = config.releaseAge;
      modal.querySelector("[data-file-size]").textContent = config.fileSize;
      modal.querySelector("[data-version-choice]").textContent = config.gameVersion;
      modal.querySelector("[data-loader-choice]").textContent = config.loader;
      syncSelection();
    };
    updateModal();

    const versionMenu = modal.querySelector("[data-version-menu]");
    const loaderMenu = modal.querySelector("[data-loader-menu]");
    modal.querySelector("[data-version-select]").addEventListener("click", () => {
      loaderMenu.hidden = true;
      versionMenu.hidden = !versionMenu.hidden;
    });
    modal.querySelector("[data-loader-select]").addEventListener("click", () => {
      versionMenu.hidden = true;
      loaderMenu.hidden = !loaderMenu.hidden;
    });
    modal.querySelector("[data-version-choice]").addEventListener("click", () => {
      selectedVersion = config.gameVersion;
      versionMenu.hidden = true;
      syncSelection();
    });
    modal.querySelector("[data-loader-choice]").addEventListener("click", () => {
      selectedLoader = config.loader;
      loaderMenu.hidden = true;
      syncSelection();
    });

    modal.querySelector("[data-download-file]").addEventListener("click", () => {
      if (!config.downloadFileUrl) {
        toast(window.offlineGithubState?.message || "Düzenle panelinden GitHub deponu bağla.");
        return;
      }
      const link = document.createElement("a");
      link.href = config.downloadFileUrl;
      link.download = config.fileName || "the-knocker-1.20.4.jar";
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
    });

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      resetSelection();
      updateModal();
      modal.hidden = false;
    }, true);

    window.offlineDownloadControls = { button, applyLabel, updateModal };
  }

  function setupEditor() {
    if (!config.showEditorButton) return;
    const launcher = document.createElement("button");
    launcher.type = "button";
    launcher.className = "offline-editor-launcher";
    launcher.innerHTML = "✦ Düzenle";
    document.body.appendChild(launcher);

    const editor = createOverlay("offline-editor-modal", `
      <h2>Yerel sayfa ayarları</h2>
      <p>Buradaki değişiklikler bu tarayıcıda saklanır. GitHub deposunun en son Release içindeki Fabric .jar dosyası otomatik bağlanır.</p>
      <label>Düğme yazısı <input data-edit-label maxlength="40"></label>
      <label>GitHub deposu <input data-edit-repo placeholder="kullanici/depo"></label>
      <label>Doğrudan .jar bağlantısı <input data-edit-url type="url" placeholder="https://.../dosya.jar"></label>
      <div class="offline-dialog-actions">
        <button type="button" data-reset>Varsayılana dön</button>
        <button type="button" data-offline-close>Vazgeç</button>
        <button type="button" class="offline-primary" data-save>Kaydet ve uygula</button>
      </div>
    `);
    const labelInput = editor.querySelector("[data-edit-label]");
    const repoInput = editor.querySelector("[data-edit-repo]");
    const urlInput = editor.querySelector("[data-edit-url]");

    launcher.addEventListener("click", () => {
      labelInput.value = config.downloadButtonLabel;
      repoInput.value = config.githubRepo || "";
      urlInput.value = config.downloadFileUrl;
      editor.hidden = false;
      labelInput.focus();
    });

    editor.querySelector("[data-save]").addEventListener("click", () => {
      const url = urlInput.value.trim();
      const repo = repoInput.value.trim();
      if (url && !/^https?:\/\//i.test(url)) {
        toast("Bağlantı http:// veya https:// ile başlamalı.");
        return;
      }
      if (repo && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
        toast("GitHub deposunu kullanıcı/depo biçiminde yaz.");
        return;
      }
      config.downloadButtonLabel = labelInput.value.trim() || defaults.downloadButtonLabel || "Download";
      config.downloadFileUrl = url;
      config.githubRepo = repo;
      localStorage.setItem("offline-page-config", JSON.stringify({
        downloadButtonLabel: config.downloadButtonLabel,
        downloadFileUrl: config.downloadFileUrl,
        githubRepo: config.githubRepo
      }));
      window.offlineDownloadControls?.applyLabel();
      window.offlineDownloadControls?.updateModal();
      editor.hidden = true;
      if (repo) {
        toast("GitHub deposuna bağlanılıyor…");
        loadGithubRelease().then(() => toast(window.offlineGithubState.message));
      } else {
        toast("Download düğmesi güncellendi.");
      }
    });

    editor.querySelector("[data-reset]").addEventListener("click", () => {
      localStorage.removeItem("offline-page-config");
      config.downloadButtonLabel = defaults.downloadButtonLabel || "Download";
      config.downloadFileUrl = defaults.downloadFileUrl || "";
      config.githubRepo = defaults.githubRepo || "";
      window.offlineDownloadControls?.applyLabel();
      window.offlineDownloadControls?.updateModal();
      editor.hidden = true;
      toast("Varsayılan ayarlara dönüldü.");
    });
  }

  function setupDiscoverMenu() {
    const button = findByText("button", "Discover content") || findByText("button", "Discover");
    if (!button) return;
    const menu = document.createElement("nav");
    menu.className = "offline-menu";
    menu.hidden = true;
    menu.innerHTML = `
      <a href="https://modrinth.com/discover/mods">Mods</a>
      <a href="https://modrinth.com/discover/resourcepacks">Resource Packs</a>
      <a href="https://modrinth.com/discover/datapacks">Data Packs</a>
      <a href="https://modrinth.com/discover/modpacks">Modpacks</a>
    `;
    document.body.appendChild(menu);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const rect = button.getBoundingClientRect();
      menu.style.top = `${rect.bottom + 8}px`;
      menu.style.left = `${Math.min(rect.left, innerWidth - 240)}px`;
      menu.hidden = !menu.hidden;
      button.setAttribute("aria-expanded", String(!menu.hidden));
    });
    document.addEventListener("click", (event) => {
      if (!menu.contains(event.target) && !button.contains(event.target)) menu.hidden = true;
    });
  }

  function repairLinks() {
    document.querySelectorAll('a[href^="/"]').forEach((link) => {
      link.href = "https://modrinth.com" + link.getAttribute("href");
    });
  }

  function keepProjectTabsLocal() {
    const links = [...document.querySelectorAll("nav a")].filter((link) => ["Description", "Gallery", "Changelog", "Versions"].includes(normalize(link.textContent)));
    const nav = links[0]?.closest("nav");
    const content = nav?.parentElement?.parentElement?.querySelector(":scope > section.normal-page__content");
    const description = content?.innerHTML || "";
    const show = (label) => {
      if (!content) return;
      if (label === "Description") content.innerHTML = description;
      if (label === "Gallery") content.innerHTML = `<div class="card"><img src="https://cdn.modrinth.com/data/hTju2zcV/images/fc0128c68f683409c0aae888ca7e0c30401ceccd_350.webp" alt="Banner" style="display:block;width:100%;border-radius:12px"><h2 style="margin:16px 0 4px">Banner</h2><p style="margin:0;color:var(--color-secondary)">April 10, 2024</p></div>`;
      if (label === "Changelog") content.innerHTML = `<div class="card" style="padding:32px;text-align:center"><h2 style="margin:0 0 8px">Changelog</h2><p style="margin:0;color:var(--color-secondary)">No changelog entries have been published.</p></div>`;
      links.forEach((item) => {
        const active = normalize(item.textContent) === label;
        item.toggleAttribute("aria-current", active);
        item.classList.toggle("bg-button-bgSelected", active);
        item.querySelector(".tab-color")?.classList.toggle("text-button-textSelected", active);
        item.querySelector(".tab-color")?.classList.toggle("text-contrast", !active);
      });
      history.replaceState(null, "", `#${label.toLowerCase()}`);
    };
    links.forEach((link) => {
      const label = normalize(link.textContent);
      if (label === "Versions") {
        link.removeAttribute("href");
        link.setAttribute("aria-disabled", "true");
        link.style.pointerEvents = "none";
        link.style.opacity = ".55";
      } else {
        link.href = `#${label.toLowerCase()}`;
        link.addEventListener("click", (event) => { event.preventDefault(); show(label); });
      }
    });
  }

  function limitCompatibility() {
    const heading = [...document.querySelectorAll("h2")].find((el) => normalize(el.textContent) === "Compatibility");
    const card = heading?.parentElement;
    if (!card) return;
    const gameSection = [...card.querySelectorAll("section")].find((el) => normalize(el.querySelector("h3")?.textContent) === "Minecraft: Java Edition");
    const versions = gameSection?.querySelectorAll(":scope > div > div");
    versions?.forEach((chip, index) => index === 0 ? chip.textContent = "1.20.4" : chip.remove());
    const platformSection = [...card.querySelectorAll("section")].find((el) => normalize(el.querySelector("h3")?.textContent) === "Platforms");
    platformSection?.querySelectorAll("button").forEach((button) => {
      if (normalize(button.textContent) !== "Fabric") button.remove();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    repairLinks();
    setupDownload();
    keepProjectTabsLocal();
    limitCompatibility();
    setupEditor();
    setupDiscoverMenu();
    loadGithubRelease();
  });
})();
