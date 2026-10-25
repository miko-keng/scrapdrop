const $ = (id) => document.getElementById(id);
let csrf = "",
  sample = true,
  files = [],
  requestKey = crypto.randomUUID();
function error(message) {
  $("error").textContent = message;
  $("error").hidden = !message;
}
async function initialise() {
  try {
    const response = await fetch("/api/session");
    if (!response.ok) throw new Error("Unable to connect. Refresh this page.");
    const state = await response.json();
    csrf = state.csrf;
    $("access").textContent = state.paid
      ? "Active TaskSlice access · up to 100 images per run"
      : state.connected
        ? "Free preview · 3 images. Launch from TaskSlice for larger batches."
        : "Free preview ready · paid access has not been connected yet.";
    $("market-link").href = state.platform;
    $("launch-link").href =
      state.platform +
      (state.providerId
        ? "/tools/" + encodeURIComponent(state.providerId)
        : "/workspace");
    const manifest = await (await fetch("/taskslice/manifest")).json();
    $("manifest").textContent = JSON.stringify(manifest, null, 2);
  } catch (e) {
    error(e.message);
  }
}
async function choose(selected) {
  error("");
  try {
    if (selected.length > 100) throw new Error("Choose at most 100 images.");
    let size = 0;
    files = await Promise.all(
      [...selected]
        .filter((file) => ["image/png", "image/jpeg"].includes(file.type))
        .map(
          (file) =>
            new Promise((resolve, reject) => {
              size += file.size;
              if (file.size > 2 * 1024 * 1024 || size > 12 * 1024 * 1024)
                return reject(
                  new Error("Use images up to 2 MB each and 12 MB total."),
                );
              const reader = new FileReader();
              reader.onload = () =>
                resolve({
                  name: file.webkitRelativePath || file.name,
                  type: file.type,
                  data: String(reader.result).split(",")[1],
                });
              reader.onerror = () => reject(new Error("Unable to read image."));
              reader.readAsDataURL(file);
            }),
        ),
    );
    if (!files.length) throw new Error("Choose JPEG or PNG images.");
    sample = false;
    $("file-description").textContent = files.length + " images selected";
    $("run").textContent = "Run selected images →";
    $("result").hidden = true;
    requestKey = crypto.randomUUID();
  } catch (e) {
    error(e.message);
  }
}
$("files").onchange = (e) => choose(e.target.files);
$("folder").onchange = (e) => choose(e.target.files);
$("sample").onclick = () => {
  sample = true;
  files = [];
  $("file-description").textContent = "Three supplied PNGs. Zero setup.";
  $("run").textContent = "Run sample →";
  $("result").hidden = true;
  requestKey = crypto.randomUUID();
};
for (const name of ["label", "date", "pattern", "folders", "mapping"])
  $(name).addEventListener("input", () => (requestKey = crypto.randomUUID()));
$("run").onclick = async () => {
  error("");
  $("run").disabled = true;
  try {
    const response = await fetch("/api/process", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
      body: JSON.stringify({
        requestKey,
        sample,
        ...(sample ? {} : { files }),
        options: {
          label: $("label").value,
          date: $("date").value,
          pattern: $("pattern").value,
          preserveFolders: $("folders").checked,
          mapping: $("mapping").value,
        },
      }),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.message || "Unable to process these files.");
    $("rows").replaceChildren(
      ...result.rows.map((row) => {
        const line = document.createElement("div"),
          before = document.createElement("span"),
          arrow = document.createElement("span"),
          after = document.createElement("strong");
        before.textContent = row.oldName;
        arrow.textContent = "→";
        after.textContent = row.newName;
        line.append(before, arrow, after);
        return line;
      }),
    );
    $("checks").textContent =
      `✓ ${result.checks.fileCount} images · unique names · original bytes preserved${result.repeated ? " · same request reused" : ""}`;
    $("download").href = result.download;
    $("result").hidden = false;
    $("result").scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion:reduce)").matches
        ? "auto"
        : "smooth",
      block: "nearest",
    });
  } catch (e) {
    error(e.message);
  } finally {
    $("run").disabled = false;
  }
};
$("copy-manifest").onclick = () =>
  navigator.clipboard
    .writeText($("manifest").textContent)
    .then(() => {
      $("copy-manifest").textContent = "Manifest copied";
    })
    .catch(() => error("Select the manifest text below and copy it."));
initialise();
