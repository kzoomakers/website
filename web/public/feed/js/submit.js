// Submit page extras: title counter and picture preview/drag highlight. The form works without this.
const title = document.getElementById("title"), count = document.getElementById("title_count");
if (title && count) { const n = () => (count.textContent = String(title.value.length)); title.addEventListener("input", n); n(); }
const zone = document.querySelector(".dropzone"), input = document.getElementById("image"), img = zone?.querySelector(".dz_preview");
if (zone && input && img) {
  const show = () => { const f = input.files?.[0]; if (!f) { img.hidden = true; return; } img.src = URL.createObjectURL(f); img.hidden = false; zone.classList.add("has_file"); };
  input.addEventListener("change", show);
  for (const e of ["dragenter", "dragover"]) zone.addEventListener(e, () => zone.classList.add("over"));
  for (const e of ["dragleave", "drop"]) zone.addEventListener(e, () => zone.classList.remove("over"));
}
