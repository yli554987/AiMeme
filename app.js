const imageInput = document.querySelector("#imageInput");
const dropZone = document.querySelector("#dropZone");
const sourcePreview = document.querySelector("#sourcePreview");
const subtitleInput = document.querySelector("#subtitleInput");
const captionInput = document.querySelector("#captionInput");
const adObjectInput = document.querySelector("#adObjectInput");
const characterInput = document.querySelector("#characterInput");
const sceneInput = document.querySelector("#sceneInput");
const personThumb = document.querySelector("#personThumb");
const providerSelect = document.querySelector("#providerSelect");
const apiKeyInput = document.querySelector("#apiKeyInput");
const referenceUrlInput = document.querySelector("#referenceUrlInput");
const adImageInput = document.querySelector("#adImageInput");
const adPreview = document.querySelector("#adPreview");
const clearBtn = document.querySelector("#clearBtn");
const productInfoBtn = document.querySelector("#productInfoBtn");
const productInfoModal = document.querySelector("#productInfoModal");
const closeProductInfoBtn = document.querySelector("#closeProductInfoBtn");
const recognizeBtn = document.querySelector("#recognizeBtn");
const generateBtn = document.querySelector("#generateBtn");
const statusPill = document.querySelector("#statusPill");
const promptOutput = document.querySelector("#promptOutput");
const canvas = document.querySelector("#stickerCanvas");
const ctx = canvas.getContext("2d");
const canvasStage = document.querySelector(".canvas-stage");
const apiImage = document.querySelector("#apiImage");
const outputPlaceholder = document.querySelector("#outputPlaceholder");
const outputDownloadBtn = document.querySelector("#outputDownloadBtn");
const recognitionStatuses = [
  document.querySelector("#personStatus"),
  document.querySelector("#sceneStatus"),
  document.querySelector("#actionStatus"),
  document.querySelector("#lineStatus"),
];

const outputSize = 900;
const generatedCanvases = new Map();
const generatedApiImages = new Map();
let sourceImage = null;
let sourceFile = null;
let adImageFile = null;
let adImage = null;
let activeStyle = "real";
let hasGeneratedSticker = false;
let hasRecognized = false;
let recognitionPromise = null;
const alwaysUseAd = true;
const alwaysTransparent = true;

const styles = [
  { id: "real", label: "真人广告贴纸" },
];

function getSelectedStyle() {
  return document.querySelector("input[name='style']:checked")?.value || activeStyle || "real";
}

function setStatus(message) {
  statusPill.textContent = message;
}

function setApiImage(src) {
  apiImage.src = src;
  canvasStage.classList.add("has-api-image");
  canvasStage.classList.add("has-result");
  hasGeneratedSticker = true;
  if (outputPlaceholder) outputPlaceholder.hidden = true;
  if (outputDownloadBtn) outputDownloadBtn.disabled = false;
}

function showCanvasPreview() {
  canvasStage.classList.remove("has-api-image");
  apiImage.removeAttribute("src");
}

function setDownloadReady(isReady) {
  hasGeneratedSticker = isReady;
  canvasStage.classList.toggle("has-result", isReady);
  if (outputPlaceholder) outputPlaceholder.hidden = isReady;
  if (outputDownloadBtn) outputDownloadBtn.disabled = !isReady;
}

function loadFile(file) {
  if (!file || !file.type.startsWith("image/")) return;

  sourceFile = file;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      sourceImage = img;
      sourcePreview.innerHTML = "";
      const preview = document.createElement("img");
      preview.src = img.src;
      preview.alt = "上传图片预览";
      sourcePreview.append(preview);
      updatePersonThumb(img.src);
      markReferencesChanged();
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function loadAdImage(file) {
  if (!file || !file.type.startsWith("image/")) return;

  adImageFile = file;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      adImage = img;
      adPreview.innerHTML = "";
      const preview = document.createElement("img");
      preview.src = img.src;
      preview.alt = "广告物品图预览";
      adPreview.append(preview);
      markReferencesChanged();
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function setRecognitionState(state) {
  const copy = {
    idle: "待识别",
    processing: "识别中...",
    done: "✓ 已识别",
  }[state];
  recognitionStatuses.forEach((pill) => {
    if (!pill) return;
    pill.textContent = copy;
    pill.classList.toggle("pending", state !== "done");
  });
}

function clearRecognitionFields() {
  if (characterInput) characterInput.value = "";
  if (sceneInput) sceneInput.value = "";
  subtitleInput.value = "";
  captionInput.value = "";
  adObjectInput.value = "";
  promptOutput.value = "先填 API Key 和服务商，上传视频截图/广告物品图，然后点击“识别上传图片”。识别完成后这里会生成可编辑的个性化 Prompt，再点击生成贴纸表情包。";
}

function markReferencesChanged() {
  hasRecognized = false;
  generatedApiImages.clear();
  generatedCanvases.clear();
  showCanvasPreview();
  setDownloadReady(false);
  setRecognitionState("idle");
  clearRecognitionFields();
  setStatus(sourceImage || referenceUrlInput.value.trim() ? "素材已上传，请点击识别上传图片" : "待上传");
}

async function runRecognition({ requireApi = false } = {}) {
  if (!sourceImage && !referenceUrlInput.value.trim()) {
    setStatus("请先上传视频截图或填写参考图 URL");
    return false;
  }

  const apiKey = apiKeyInput.value.trim();
  const provider = providerSelect.value;
  if (provider === "minimax") {
    hasRecognized = false;
    setRecognitionState("idle");
    setStatus("MiniMax image-01 不能识别图片，请切换 OpenAI 或 Qwen 识别，或手动填写后生成");
    return false;
  }

  if (!apiKey) {
    hasRecognized = false;
    setRecognitionState("idle");
    setStatus(requireApi ? "请填写 API Key 后识别素材" : "已上传，请填写 API Key 后识别");
    if (!requireApi) clearRecognitionFields();
    return false;
  }

  if (recognitionPromise) return recognitionPromise;

  hasRecognized = false;
  setRecognitionState("processing");
  setStatus("LLM 正在识别上传图片...");
  setDownloadReady(false);
  showCanvasPreview();

  recognitionPromise = recognizeWithLLM(provider, apiKey)
    .then((result) => {
      applyRecognitionResult(result);
      hasRecognized = true;
      setRecognitionState("done");
      setStatus("LLM 已识别上传图片，请检查 Prompt 后生成");
      return true;
    })
    .catch((error) => {
      hasRecognized = false;
      setRecognitionState("idle");
      setStatus("识别失败");
      if (requireApi) throw error;
      alert(error.message);
      return false;
    })
    .finally(() => {
      recognitionPromise = null;
    });

  return recognitionPromise;
}

function updatePersonThumb(src) {
  if (!personThumb) return;
  personThumb.innerHTML = "";
  const img = document.createElement("img");
  img.src = src;
  img.alt = "识别人物缩略图";
  personThumb.append(img);
  personThumb.classList.remove("is-empty");
}

function updateReferenceUrlPreview() {
  const url = referenceUrlInput.value.trim();
  if (!url || sourceFile) return;

  sourcePreview.innerHTML = "";
  const preview = document.createElement("img");
  preview.src = url;
  preview.alt = "参考图 URL 预览";
  preview.referrerPolicy = "no-referrer";
  preview.onerror = () => {
    sourcePreview.innerHTML = '<div class="empty-preview">参考图 URL</div>';
  };
  sourcePreview.append(preview);
}

function inferProductName() {
  const raw = `${adImageFile?.name || ""} ${referenceUrlInput.value || ""}`.toLowerCase();
  if (/milk|奶|bottle|瓶/.test(raw)) return "牛奶瓶";
  if (/coffee|咖啡/.test(raw)) return "咖啡杯";
  if (/tea|茶/.test(raw)) return "茶饮杯";
  if (/cola|soda|pepsi|可乐|汽水/.test(raw)) return "蓝色汽水罐";
  if (/phone|手机/.test(raw)) return "手机";
  return adImage ? "广告物品" : "蓝色汽水罐";
}

function inferSceneLine() {
  if (!sourceImage) return "根据截图里的台词和动作生成贴纸情绪";
  const isWide = sourceImage.width >= sourceImage.height;
  return isWide ? "抱臂，手持杯子，正在对话" : "近景大头，正在对话";
}

function inferCharacter() {
  if (!sourceImage) return "人物角色";
  return sourceImage.width >= sourceImage.height ? "女性角色" : "真人大头角色";
}

function inferScene() {
  if (!sourceImage) return "根据截图识别场景";
  return sourceImage.width >= sourceImage.height ? "室内 / 办公室 / 对话场景" : "近景 / 生活场景";
}

function inferCaption(sceneLine, productName) {
  if (/抱臂|杯子|对话/.test(sceneLine)) return "约凌奕凯吃饭";
  if (/拿下|方案|必须/.test(sceneLine)) return "拿下";
  if (/开心|笑|拉满|状态/.test(sceneLine)) return "状态拉满";
  if (/花|钱|红包/.test(sceneLine)) return "拿去花";
  if (/奶|汽水|咖啡|茶/.test(productName)) return "来一口";
  return sceneLine.slice(0, 6) || "拿下";
}

function getRecognitionInstruction() {
  return [
    "你是腾讯视频 AI 贴纸表情包功能的视觉理解模块。",
    "请真实分析用户上传的视频截图，不要用默认示例，不要凭空套用固定文案。",
    "截图可能包含真人、字幕、人物动作、广告物品参考图。请把识别结果用于后续贴纸生成。",
    "必须只返回 JSON，不要 Markdown，不要解释。",
    "JSON 字段：",
    "{",
    '  "character": "人物身份或画面主体，例如女性角色/男性角色/真人大头/多人对话",',
    '  "scene": "场景，例如室内办公室/餐桌对话/街景/近景自拍",',
    '  "action": "人物动作和情绪，例如抱臂拿杯子正在对话/惊讶/开心/皱眉",',
    '  "subtitle": "从截图中 OCR 出来的原始台词；如果看不清就写空字符串",',
    '  "main_caption": "结合台词、表情和动作提炼的贴纸主文案，中文，2 到 8 个字，不能照搬广告品名，不能无关",',
    '  "ad_object": "从广告物品图或截图中识别到的商品/品牌视觉元素；没有就写适合自然植入的小商品",',
    '  "sticker_direction": "一句贴纸生成建议，说明人物、广告物品和文字如何组合"',
    "}",
  ].join("\n");
}

function getVisionContentForOpenAI(text) {
  const content = [{ type: "text", text }];
  const mainImage = sourceImage?.src || referenceUrlInput.value.trim();
  if (mainImage) {
    content.push({
      type: "image_url",
      image_url: { url: mainImage },
    });
  }
  if (adImage?.src) {
    content.push({
      type: "image_url",
      image_url: { url: adImage.src },
    });
  }
  return content;
}

function getVisionContentForDashScope(text) {
  const content = [{ text }];
  const mainImage = sourceImage?.src || referenceUrlInput.value.trim();
  if (mainImage) content.push({ image: mainImage });
  if (adImage?.src) content.push({ image: adImage.src });
  return content;
}

async function recognizeWithLLM(provider, apiKey) {
  if (provider === "openai-gpt-image-2") return recognizeWithOpenAI(apiKey);
  if (provider === "qwen-image") return recognizeWithQwen(apiKey);
  throw new Error("当前服务商没有接入素材视觉识别，请切换 OpenAI 或通义千问后再识别。");
}

async function recognizeWithOpenAI(apiKey) {
  const result = await fetchJson("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "你只输出合法 JSON。" },
        { role: "user", content: getVisionContentForOpenAI(getRecognitionInstruction()) },
      ],
    }),
  });
  return parseRecognitionResult(extractChatText(result), "OpenAI 视觉识别");
}

async function recognizeWithQwen(apiKey) {
  const result = await fetchJson("https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "qwen-vl-plus-latest",
      input: {
        messages: [
          {
            role: "user",
            content: getVisionContentForDashScope(getRecognitionInstruction()),
          },
        ],
      },
      parameters: {
        temperature: 0.2,
      },
    }),
  });
  return parseRecognitionResult(extractChatText(result), "通义千问视觉识别");
}

function extractChatText(result) {
  const content =
    result?.choices?.[0]?.message?.content ||
    result?.data?.choices?.[0]?.message?.content ||
    result?.output?.choices?.[0]?.message?.content ||
    result?.output?.text ||
    result?.text ||
    "";

  if (Array.isArray(content)) {
    return content
      .map((item) => item?.text || item?.content || "")
      .filter(Boolean)
      .join("\n");
  }
  return String(content || "");
}

function parseRecognitionResult(text, providerName) {
  const raw = String(text || "").trim();
  const jsonText = raw.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] || raw.match(/\{[\s\S]*\}/)?.[0] || raw;
  try {
    const result = JSON.parse(jsonText);
    if (!hasMeaningfulRecognition(result)) {
      throw new Error("empty");
    }
    return result;
  } catch {
    throw new Error(`${providerName} 没有返回可解析的 JSON 识别结果：${raw.slice(0, 600)}`);
  }
}

function hasMeaningfulRecognition(result) {
  const values = [
    result?.character,
    result?.scene,
    result?.action,
    result?.subtitle,
    result?.main_caption,
    result?.caption,
    result?.ad_object,
    result?.product,
  ]
    .map((value) => normalizeStickerText(value))
    .filter(Boolean);
  if (!values.length) return false;
  return values.some((value) => !/无图片|没有图片|无法查看|无法读取|no image|image data/i.test(value));
}

function applyRecognitionResult(result) {
  const character = normalizeStickerText(result.character);
  const scene = normalizeStickerText(result.scene);
  const action = normalizeStickerText(result.action);
  const subtitle = normalizeStickerText(result.subtitle);
  const mainCaption = normalizeStickerText(result.main_caption || result.caption);
  const adObject = normalizeStickerText(result.ad_object || result.product);

  if (characterInput) characterInput.value = character || "已识别人物";
  if (sceneInput) sceneInput.value = scene || "已识别场景";
  subtitleInput.value = action || subtitle || "已识别动作";
  captionInput.value = mainCaption || inferCaption(subtitle || action, adObject);
  adObjectInput.value = adObject || inferProductName();
  promptOutput.value = buildPrompt(activeStyle);
}

function hasManualRecognitionInput() {
  return Boolean(
    normalizeStickerText(characterInput?.value) &&
      normalizeStickerText(sceneInput?.value) &&
      normalizeStickerText(subtitleInput.value) &&
      normalizeStickerText(captionInput.value)
  );
}

function dataUrlToFile(dataUrl, filename) {
  const [meta, base64] = dataUrl.split(",");
  const mime = meta.match(/data:(.*?);/)?.[1] || "image/png";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], filename, { type: mime });
}

function drawStarterState() {
  showCanvasPreview();
  ctx.clearRect(0, 0, outputSize, outputSize);
  canvasStage.classList.remove("has-result");
  if (outputPlaceholder) {
    outputPlaceholder.hidden = false;
    outputPlaceholder.textContent = "贴纸结果区";
  }
  drawTransparentOrSoftBackground(ctx);
  drawDecorativeBurst(ctx, 450, 395, 250, "#f2c94c");
  drawProduct(ctx, 640, 560, "蓝色汽水罐", "poster", 1);
  drawFacePlaceholder(ctx, 360, 315);
  drawStickerText(ctx, "上传人物截图", 450, 735, "poster");
  clearRecognitionFields();
  setDownloadReady(false);
  setRecognitionState("idle");
}

function drawTransparentOrSoftBackground(context) {
  if (alwaysTransparent) return;
  const bg = context.createLinearGradient(0, 0, outputSize, outputSize);
  bg.addColorStop(0, "#f7fbff");
  bg.addColorStop(0.55, "#fff7e3");
  bg.addColorStop(1, "#ffecef");
  context.fillStyle = bg;
  context.fillRect(0, 0, outputSize, outputSize);
}

function roundedPath(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function drawFacePlaceholder(context, x, y) {
  context.save();
  context.shadowColor = "rgba(23, 32, 27, 0.2)";
  context.shadowBlur = 28;
  context.shadowOffsetY = 18;
  context.lineWidth = 22;
  context.strokeStyle = "#ffffff";
  context.fillStyle = "#f2c3a0";
  context.beginPath();
  context.ellipse(x, y, 142, 168, 0, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.shadowColor = "transparent";
  context.fillStyle = "#20262d";
  context.beginPath();
  context.ellipse(x, y - 98, 154, 78, 0, Math.PI, Math.PI * 2);
  context.fill();
  context.fillStyle = "#12171c";
  context.beginPath();
  context.ellipse(x - 46, y - 18, 11, 15, 0, 0, Math.PI * 2);
  context.ellipse(x + 46, y - 18, 11, 15, 0, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "#b46158";
  context.lineWidth = 8;
  context.beginPath();
  context.arc(x, y + 28, 42, 0.08, Math.PI - 0.08);
  context.stroke();
  context.restore();
}

function getPersonCrop() {
  const img = sourceImage;
  const crop = Math.min(img.width, img.height) * 0.78;
  const srcX = Math.max(0, (img.width - crop) / 2);
  const srcY = Math.max(0, img.height * 0.04);
  return { srcX, srcY, srcW: crop, srcH: Math.min(crop, img.height - srcY) };
}

function drawPersonHead(context, variantStyle) {
  const { srcX, srcY, srcW, srcH } = getPersonCrop();
  const headSize = variantStyle === "cartoon" ? 500 : 465;
  const x = variantStyle === "poster" ? 500 : 430;
  const y = variantStyle === "poster" ? 305 : 310;

  context.save();
  context.shadowColor = "rgba(23, 32, 27, 0.26)";
  context.shadowBlur = 34;
  context.shadowOffsetY = 20;
  context.lineWidth = 28;
  context.strokeStyle = "#ffffff";
  context.beginPath();
  context.ellipse(x, y, headSize * 0.43, headSize * 0.49, 0, 0, Math.PI * 2);
  context.stroke();
  context.clip();
  context.filter = getImageFilter(variantStyle);
  context.drawImage(sourceImage, srcX, srcY, srcW, srcH, x - headSize / 2, y - headSize / 2, headSize, headSize);
  context.filter = "none";
  if (variantStyle === "cartoon") drawCartoonFaceOverlay(context, x, y);
  context.restore();

  context.save();
  context.lineWidth = 24;
  context.strokeStyle = "#ffffff";
  context.beginPath();
  context.ellipse(x, y, headSize * 0.43, headSize * 0.49, 0, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

function drawSmallBody(context, variantStyle) {
  context.save();
  context.translate(392, 565);
  context.rotate(variantStyle === "poster" ? -0.05 : 0.04);
  context.shadowColor = "rgba(23, 32, 27, 0.2)";
  context.shadowBlur = 24;
  context.shadowOffsetY = 16;
  context.lineWidth = 22;
  context.strokeStyle = "#ffffff";
  roundedPath(context, -145, -85, 300, 230, 72);
  context.fillStyle = variantStyle === "poster" ? "#1159a6" : "#24364d";
  context.fill();
  context.stroke();
  context.shadowColor = "transparent";
  context.fillStyle = "#ffffff";
  roundedPath(context, -36, -78, 84, 88, 22);
  context.fill();
  context.restore();
}

function getImageFilter(variantStyle) {
  if (variantStyle === "cartoon") return "contrast(1.24) saturate(1.85) brightness(1.08)";
  if (variantStyle === "poster") return "contrast(1.08) saturate(1.2)";
  return "contrast(1.03) saturate(1.08)";
}

function drawCartoonFaceOverlay(context, x, y) {
  context.globalCompositeOperation = "source-over";
  context.fillStyle = "rgba(255, 110, 120, 0.42)";
  context.beginPath();
  context.ellipse(x - 95, y + 42, 42, 24, -0.08, 0, Math.PI * 2);
  context.ellipse(x + 95, y + 42, 42, 24, 0.08, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "#ffffff";
  context.lineWidth = 10;
  [["left", -135], ["right", 135]].forEach((item) => {
    const offset = item[1];
    context.beginPath();
    context.moveTo(x + offset, y + 42);
    context.lineTo(x + offset - 18, y + 62);
    context.stroke();
    context.beginPath();
    context.moveTo(x + offset + 28, y + 42);
    context.lineTo(x + offset + 45, y + 62);
    context.stroke();
  });
  drawSweatDrop(context, x - 190, y - 70, 1.1);
}

function drawDecorativeBurst(context, x, y, radius, color) {
  context.save();
  context.translate(x, y);
  context.fillStyle = color;
  for (let i = 0; i < 18; i += 1) {
    context.rotate((Math.PI * 2) / 18);
    context.beginPath();
    context.moveTo(radius * 0.55, -8);
    context.lineTo(radius, 0);
    context.lineTo(radius * 0.55, 8);
    context.closePath();
    context.fill();
  }
  context.restore();
}

function drawSweatDrop(context, x, y, scale = 1) {
  context.save();
  context.translate(x, y);
  context.scale(scale, scale);
  context.shadowColor = "rgba(0, 87, 140, 0.22)";
  context.shadowBlur = 12;
  context.fillStyle = "#21a7e8";
  context.beginPath();
  context.moveTo(0, -72);
  context.bezierCurveTo(56, -16, 58, 54, 0, 70);
  context.bezierCurveTo(-58, 54, -56, -16, 0, -72);
  context.fill();
  context.fillStyle = "rgba(255, 255, 255, 0.42)";
  context.beginPath();
  context.ellipse(-18, -24, 14, 28, 0.35, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawProduct(context, x, y, label, variantStyle, scale = 1) {
  context.save();
  context.translate(x, y);
  context.rotate(variantStyle === "poster" ? 0.17 : -0.16);
  context.scale(scale, scale);
  context.shadowColor = "rgba(23, 32, 27, 0.25)";
  context.shadowBlur = 18;
  context.shadowOffsetY = 12;
  context.lineWidth = 12;
  context.strokeStyle = "#ffffff";

  if (/奶|瓶|milk|bottle/i.test(label)) {
    roundedPath(context, -52, -118, 104, 218, 22);
    context.fillStyle = "#ffffff";
    context.fill();
    context.stroke();
    roundedPath(context, -28, -152, 56, 42, 12);
    context.fill();
    context.stroke();
    context.fillStyle = "#24a06e";
    roundedPath(context, -38, -40, 76, 80, 18);
    context.fill();
  } else {
    roundedPath(context, -54, -118, 108, 236, 28);
    context.fillStyle = "#1267b3";
    context.fill();
    context.stroke();
    context.fillStyle = "#e84d4f";
    context.beginPath();
    context.arc(0, -10, 38, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#ffffff";
    context.font = "900 26px Inter, system-ui, sans-serif";
    context.textAlign = "center";
    context.fillText("AD", 0, 0);
  }

  context.shadowColor = "transparent";
  context.fillStyle = "#ffffff";
  context.font = "900 18px Inter, system-ui, sans-serif";
  context.textAlign = "center";
  context.fillText(label.slice(0, 5), 0, 70);
  context.restore();
}

function drawSideText(context, text, side, variantStyle) {
  const chars = normalizeStickerText(text || getPrimaryCaption()).slice(0, 5).split("");
  const x = side === "left" ? 108 : 790;
  const y = side === "left" ? 170 : 170;
  context.save();
  chars.forEach((char, index) => {
    context.beginPath();
    context.arc(x, y + index * 98, 46, 0, Math.PI * 2);
    context.fillStyle = variantStyle === "poster" ? "#1267b3" : "#e84d4f";
    context.fill();
    context.lineWidth = 10;
    context.strokeStyle = "#ffffff";
    context.stroke();
    context.fillStyle = "#fff3a0";
    context.font = "900 44px serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(char, x, y + index * 98 + 2);
  });
  context.restore();
}

function getPrimaryCaption() {
  return normalizeStickerText(captionInput.value || subtitleInput.value || "拿下");
}

function getSceneLine() {
  return normalizeStickerText(subtitleInput.value || "根据动作生成情绪");
}

function normalizeStickerText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function drawStickerText(context, text, x, y, variantStyle) {
  const cleanText = normalizeStickerText(text) || "拿下";
  const lines = wrapText(context, cleanText, 620, 2, "900 64px Inter, system-ui, sans-serif");
  const height = 76 + lines.length * 64;

  context.save();
  context.translate(x, y);
  context.rotate(variantStyle === "cartoon" ? -0.04 : 0.025);
  roundedPath(context, -345, -height / 2, 690, height, 34);
  context.fillStyle = variantStyle === "poster" ? "#1267b3" : "#e84d4f";
  context.strokeStyle = "#ffffff";
  context.lineWidth = 14;
  context.shadowColor = "rgba(23, 32, 27, 0.2)";
  context.shadowBlur = 22;
  context.shadowOffsetY = 14;
  context.fill();
  context.stroke();
  context.shadowColor = "transparent";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = "900 64px Inter, system-ui, sans-serif";
  context.lineWidth = 10;
  context.strokeStyle = "rgba(23, 32, 27, 0.2)";
  context.fillStyle = "#fff5b5";
  lines.forEach((line, index) => {
    const lineY = -((lines.length - 1) * 32) + index * 64 + 3;
    context.strokeText(line, 0, lineY);
    context.fillText(line, 0, lineY);
  });
  context.restore();
}

function createDownloadIcon() {
  const icon = document.createElement("span");
  icon.className = "download-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "↓";
  return icon;
}

function showOutputProcess(message) {
  showCanvasPreview();
  canvasStage.classList.remove("has-result");
  if (outputPlaceholder) {
    outputPlaceholder.hidden = false;
    outputPlaceholder.textContent = message;
  }
}

function drawSceneTag(context, text, variantStyle) {
  const cleanText = normalizeStickerText(text);
  if (!cleanText) return;

  const tagText = `“${cleanText.slice(0, 18)}”`;
  context.save();
  context.translate(455, variantStyle === "poster" ? 108 : 112);
  context.rotate(variantStyle === "cartoon" ? 0.04 : -0.025);
  context.font = "800 30px Inter, system-ui, sans-serif";
  const width = Math.min(700, Math.max(280, context.measureText(tagText).width + 56));
  roundedPath(context, -width / 2, -31, width, 62, 22);
  context.fillStyle = "rgba(255, 255, 255, 0.94)";
  context.strokeStyle = variantStyle === "poster" ? "#1267b3" : "#e84d4f";
  context.lineWidth = 6;
  context.shadowColor = "rgba(23, 32, 27, 0.12)";
  context.shadowBlur = 16;
  context.shadowOffsetY = 8;
  context.fill();
  context.stroke();
  context.shadowColor = "transparent";
  context.fillStyle = "#17201b";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(tagText, 0, 2);
  context.restore();
}

function getDecorativeCaption(text) {
  const cleanText = normalizeStickerText(text);
  if (cleanText.length <= 5) return cleanText;
  return cleanText.slice(0, 5);
}

function wrapText(context, text, maxWidth, maxLines, font) {
  context.save();
  context.font = font;
  const chars = text.includes(" ") ? text.split(/\s+/) : text.split("");
  const lines = [];
  let current = "";
  chars.forEach((char) => {
    const next = text.includes(" ") && current ? `${current} ${char}` : `${current}${char}`;
    if (context.measureText(next).width <= maxWidth) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = char;
    }
  });
  if (current) lines.push(current);
  context.restore();
  return lines.slice(0, maxLines || 2);
}

function renderSticker(targetCanvas, variantStyle) {
  const tctx = targetCanvas.getContext("2d");
  targetCanvas.width = outputSize;
  targetCanvas.height = outputSize;
  tctx.clearRect(0, 0, outputSize, outputSize);

  drawTransparentOrSoftBackground(tctx);

  if (variantStyle !== "real") {
    drawDecorativeBurst(tctx, 452, 346, variantStyle === "cartoon" ? 245 : 290, variantStyle === "cartoon" ? "#f2c94c" : "#dff0ff");
  }

  drawSmallBody(tctx, variantStyle);
  drawPersonHead(tctx, variantStyle);

  if (variantStyle === "cartoon") {
    drawSweatDrop(tctx, 180, 245, 1.05);
  }

  const productLabel = adObjectInput.value.trim() || "广告物品";
  if (alwaysUseAd || variantStyle === "poster") {
    drawProduct(tctx, variantStyle === "poster" ? 705 : 670, variantStyle === "poster" ? 490 : 555, productLabel, variantStyle, variantStyle === "poster" ? 1.08 : 0.92);
  }

  if (variantStyle === "poster") {
    drawSideText(tctx, getDecorativeCaption(getPrimaryCaption()), "left", variantStyle);
    drawSideText(tctx, getDecorativeCaption(getPrimaryCaption()), "right", variantStyle);
  }

  drawStickerText(tctx, getPrimaryCaption(), 450, 760, variantStyle);
}

function buildPrompt(styleId = getSelectedStyle()) {
  const styleText = {
    real: "真人广告贴纸，保留上传图中人物五官和发型，真人质感但做轻微夸张大头比例",
  }[styleId];
  const action = subtitleInput.value.trim() || "根据截图里的台词和动作生成贴纸情绪";
  const caption = getPrimaryCaption();
  const product = adObjectInput.value.trim() || "一个小型广告商品";
  const character = characterInput?.value?.trim() || "人物角色";
  const scene = sceneInput?.value?.trim() || "截图场景";
  const adLine = adImageFile
    ? `必须使用上传的广告产品图作为广告方要宣传的核心产品/品牌元素。无论上传的是实物、包装、Logo 还是品牌标识，都必须清晰出现在贴纸中，作为人物手持物、身旁产品、角标或文字装饰，不能省略，不能换成无关商品，不要遮挡人物脸部。识别到的广告元素名称：${product}。`
    : `必须加入广告元素：${product}，作为人物手持物、身旁产品或右下角装饰，不要遮挡脸部。`;

  return [
    "使用上传截图作为人物参考图，生成一张方形透明背景 PNG 贴纸/表情包贴纸。",
    styleText,
    "以下识别信息只供理解画面，绝对不要把这些描述文字画到贴纸上：",
    `人物参考（不可渲染成文字）：「${character}」。`,
    `场景参考（不可渲染成文字）：「${scene}」。`,
    `动作/情绪参考（不可渲染成文字）：「${action}」。`,
    "不要在画面里出现“抱臂”“手持杯子”“正在对话”“室内”“办公室”“女性角色”等任何识别描述词。",
    `贴纸上唯一允许出现的大标题文字是：「${caption}」。必须只显示这句主文案。`,
    `不要生成与主文案无关的大字，不要把动作描述、场景描述、人物描述、广告物品名称改写成标题，不要额外编造口号。装饰文字如必须出现，只能重复或拆分主文案「${caption}」。`,
    adLine,
    "如果参考图 URL 存在，优先把它作为人物/画面视觉参考；视频真人截图用于识别人、动作、台词和整体场景。",
    "构图要求：人物是主体，大头占画面中心；有厚白描边、干净阴影、可直接用于聊天贴纸；广告元素自然融入画面，不像硬广横幅。",
    "文字要求：主文案放在底部或人物旁边的大标题区；字体简单粗大，最多一到两行；不要添加任何小气泡台词或说明文字。",
    "风格参考：真人广告贴纸、明星代言海报、可爱大头贴、商品装饰物、干净白底或透明底。",
  ].join("\n");
}

async function generateSticker() {
  const provider = providerSelect.value;
  if (provider !== "local") {
    await generateWithApi(provider);
    return;
  }

  if (!sourceImage && !referenceUrlInput.value.trim()) {
    setStatus("请先上传视频截图或填写参考图 URL");
    return;
  }

  if (!hasRecognized && !hasManualRecognitionInput()) {
    setStatus("请先识别上传图片，或手动填写识别结果和主文案");
    return;
  }

  const selected = getSelectedStyle();
  activeStyle = selected;
  generatedCanvases.clear();
  generatedApiImages.clear();

  const variantCanvas = document.createElement("canvas");
  renderSticker(variantCanvas, selected);
  generatedCanvases.set(selected, variantCanvas);
  drawActiveCanvas(selected);
  promptOutput.value = buildPrompt(selected);
  setDownloadReady(true);
  setStatus("已生成草图");
}

async function generateWithApi(provider) {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    setStatus("请填写 API Key");
    return;
  }

  if (!sourceImage && !referenceUrlInput.value.trim()) {
    setStatus("请先上传视频截图");
    return;
  }

  if ((sourceImage || referenceUrlInput.value.trim()) && !hasRecognized && !hasManualRecognitionInput()) {
    setStatus("请先识别上传图片，或手动填写识别结果和主文案");
    return;
  }

  activeStyle = getSelectedStyle();
  promptOutput.value = buildPrompt(activeStyle);
  setStatus("请求生图中...");
  generateBtn.disabled = true;
  setDownloadReady(false);
  generatedApiImages.clear();
  generatedCanvases.clear();
  showOutputProcess("生成中...");

  try {
    setStatus("生成真人广告贴纸中...");
    const imageUrl = await requestImageGeneration(provider, apiKey, buildPrompt(activeStyle));
    generatedApiImages.set(activeStyle, imageUrl);
    setApiImage(imageUrl);
    promptOutput.value = buildPrompt(activeStyle);
    setDownloadReady(true);
    setStatus("API 已生成");
  } catch (error) {
    setStatus("生成失败");
    alert(error.message);
  } finally {
    generateBtn.disabled = false;
  }
}

async function requestImageGeneration(provider, apiKey, prompt) {
  if (provider === "openai-gpt-image-2") return requestOpenAIImage(apiKey, prompt);
  if (provider === "qwen-image") return requestQwenImage(apiKey, prompt);
  if (provider === "minimax") return requestMiniMax(apiKey, prompt);
  throw new Error("未知服务商");
}

async function requestOpenAIImage(apiKey, prompt) {
  const hasReference = sourceFile instanceof File || adImageFile instanceof File;
  const endpoint = hasReference
    ? "https://api.openai.com/v1/images/edits"
    : "https://api.openai.com/v1/images/generations";

  const form = new FormData();
  form.append("model", "gpt-image-2");
  form.append("prompt", prompt);
  form.append("size", "1024x1024");
  form.append("n", "1");
  form.append("background", alwaysTransparent ? "transparent" : "opaque");
  form.append("output_format", "png");
  form.append("quality", "high");

  if (sourceFile instanceof File && adImageFile instanceof File) {
    form.append("image[]", sourceFile, sourceFile.name || "reference.png");
    form.append("image[]", adImageFile, adImageFile.name || "ad-product.png");
  } else if (sourceFile instanceof File) {
    form.append("image", sourceFile, sourceFile.name || "reference.png");
  } else if (adImageFile instanceof File) {
    form.append("image", adImageFile, adImageFile.name || "ad-product.png");
  }

  const result = await fetchJson(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  return extractImageUrl(result, "OpenAI gpt-image-2");
}

function getReferenceImagePayload() {
  const url = referenceUrlInput.value.trim();
  if (url) return url;
  if (sourceImage?.src?.startsWith("data:")) return sourceImage.src;
  return "";
}

async function requestMiniMax(apiKey, prompt) {
  const reference = getReferenceImagePayload();
  const body = {
    model: "image-01",
    prompt,
    aspect_ratio: "1:1",
    response_format: "base64",
    n: 1,
    prompt_optimizer: true,
  };

  if (reference) {
    body.subject_reference = [{ type: "character", image_file: reference }];
  }

  const result = await fetchJson("https://api.minimax.io/v1/image_generation", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return extractImageUrl(result, "MiniMax");
}

async function requestQwenImage(apiKey, prompt) {
  const content = [{ text: prompt }];
  const reference = getReferenceImagePayload();
  if (reference) content.push({ image: reference });
  if (adImage?.src?.startsWith("data:")) content.push({ image: adImage.src });

  const result = await fetchJson("https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "qwen-image-2.0-pro",
      input: {
        messages: [
          {
            role: "user",
            content,
          },
        ],
      },
      parameters: {
        size: "1024*1024",
        n: 1,
        watermark: false,
        prompt_extend: true,
      },
    }),
  });

  return extractImageUrl(result, "通义千问 Qwen-Image");
}

async function fetchJson(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    throw new Error(`浏览器请求失败，可能是 CORS 或网络限制：${error.message}`);
  }

  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`接口返回非 JSON：${text.slice(0, 600)}`);
  }

  if (!response.ok) {
    throw new Error(`接口错误 ${response.status}：${JSON.stringify(json).slice(0, 600)}`);
  }

  if (json.error || json.base_resp?.status_code || json.code) {
    const okMiniMax = json.base_resp?.status_code === 0;
    if (!okMiniMax) throw new Error(`接口返回错误：${JSON.stringify(json).slice(0, 600)}`);
  }

  return json;
}

function extractImageUrl(result, providerName) {
  const url = tryExtractImageUrl(result);
  if (!url) throw new Error(`${providerName} 未返回可用图片：${JSON.stringify(result).slice(0, 600)}`);
  return url;
}

function tryExtractImageUrl(result) {
  const candidates = [
    result?.data?.[0]?.url,
    result?.data?.[0]?.b64_json,
    result?.data?.image_url,
    result?.data?.image_base64,
    result?.data?.image_base64?.[0],
    result?.data?.image_urls?.[0],
    result?.data?.images?.[0]?.url,
    result?.data?.images?.[0],
    result?.images?.[0]?.url,
    result?.images?.[0],
    result?.image_urls?.[0],
    result?.image_base64,
    result?.url,
    result?.output?.choices?.[0]?.message?.content?.find?.((item) => item?.image)?.image,
    result?.output?.results?.[0]?.url,
    result?.output?.results?.[0]?.orig_url,
    result?.output?.task_results?.[0]?.url,
    result?.output?.images?.[0],
    result?.result?.images?.[0],
  ].filter(Boolean);

  const value = candidates.find((item) => typeof item === "string");
  if (!value) return "";
  if (value.startsWith("http") || value.startsWith("data:")) return value;
  return `data:image/png;base64,${value}`;
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function drawActiveCanvas(styleId) {
  activeStyle = styleId;
  if (generatedApiImages.has(styleId)) {
    setApiImage(generatedApiImages.get(styleId));
  } else if (generatedCanvases.has(styleId)) {
    showCanvasPreview();
    ctx.clearRect(0, 0, outputSize, outputSize);
    ctx.drawImage(generatedCanvases.get(styleId), 0, 0);
    canvasStage.classList.add("has-result");
    if (outputPlaceholder) outputPlaceholder.hidden = true;
    if (outputDownloadBtn) outputDownloadBtn.disabled = false;
  }
  promptOutput.value = buildPrompt(styleId);
}

async function downloadSticker(styleId = activeStyle) {
  if (!hasGeneratedSticker) {
    setStatus("请先生成贴纸");
    return;
  }

  const apiSrc = generatedApiImages.get(styleId);
  if (apiSrc) {
    try {
      await downloadImageSource(apiSrc, `ai-sticker-${providerSelect.value}-${styleId}.png`);
      setStatus("PNG 已下载");
    } catch (error) {
      setStatus("下载失败");
      alert(error.message);
    }
    return;
  }

  if (!generatedCanvases.has(styleId)) return;
  const link = document.createElement("a");
  link.download = `ai-sticker-${styleId}.png`;
  link.href = generatedCanvases.get(styleId).toDataURL("image/png");
  link.click();
  setStatus("PNG 已下载");
}

function clearAll() {
  sourceImage = null;
  sourceFile = null;
  adImageFile = null;
  adImage = null;
  activeStyle = "real";
  hasRecognized = false;
  generatedCanvases.clear();
  generatedApiImages.clear();
  showCanvasPreview();
  setDownloadReady(false);
  setRecognitionState("idle");

  imageInput.value = "";
  adImageInput.value = "";
  apiKeyInput.value = "";
  referenceUrlInput.value = "";
  subtitleInput.value = "";
  captionInput.value = "";
  adObjectInput.value = "";
  if (characterInput) characterInput.value = "";
  if (sceneInput) sceneInput.value = "";
  providerSelect.value = "qwen-image";
  const realStyleInput = document.querySelector("input[name='style'][value='real']");
  if (realStyleInput) realStyleInput.checked = true;

  sourcePreview.innerHTML = '<div class="empty-preview">上传真人截图</div>';
  adPreview.innerHTML = '<div class="empty-preview">上传广告物品图</div>';
  if (personThumb) {
    personThumb.innerHTML = "";
    personThumb.classList.add("is-empty");
  }
  setStatus("已清空");
  drawStarterState();
}

function openProductInfo() {
  productInfoModal.hidden = false;
  closeProductInfoBtn.focus();
}

function closeProductInfo() {
  productInfoModal.hidden = true;
  productInfoBtn.focus();
}

async function downloadImageSource(src, filename) {
  if (src.startsWith("data:")) {
    triggerDownload(src, filename);
    return;
  }

  const response = await fetch(src, { mode: "cors" });
  if (!response.ok) throw new Error(`图片下载失败：${response.status}`);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  triggerDownload(objectUrl, filename);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function triggerDownload(href, filename) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = href;
  document.body.append(link);
  link.click();
  link.remove();
}

imageInput.addEventListener("change", (event) => loadFile(event.target.files[0]));
adImageInput.addEventListener("change", (event) => loadAdImage(event.target.files[0]));
clearBtn.addEventListener("click", clearAll);
productInfoBtn.addEventListener("click", openProductInfo);
closeProductInfoBtn.addEventListener("click", closeProductInfo);
productInfoModal.addEventListener("click", (event) => {
  if (event.target === productInfoModal) closeProductInfo();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !productInfoModal.hidden) closeProductInfo();
});
recognizeBtn.addEventListener("click", () => runRecognition({ requireApi: true }));
generateBtn.addEventListener("click", generateSticker);
outputDownloadBtn.addEventListener("click", () => downloadSticker(activeStyle));
apiKeyInput.addEventListener("change", () => {
  hasRecognized = false;
  setRecognitionState("idle");
  setStatus(sourceImage || referenceUrlInput.value.trim() ? "API Key 已更新，请点击识别上传图片" : "准备 API");
});

document.querySelectorAll("input[name='style']").forEach((input) => {
  input.addEventListener("change", () => {
    activeStyle = input.value;
    if (hasRecognized || hasManualRecognitionInput()) {
      promptOutput.value = buildPrompt(input.value);
    }
    setDownloadReady(false);
    setStatus(hasRecognized || hasManualRecognitionInput() ? "风格已更新，点击生成" : "风格已更新，请先识别上传图片");
  });
});

[subtitleInput, captionInput, adObjectInput, characterInput, sceneInput].forEach((input) => {
  if (!input) return;
  input.addEventListener("input", () => {
    if (hasRecognized || hasManualRecognitionInput()) {
      promptOutput.value = buildPrompt(activeStyle);
    }
    setDownloadReady(false);
    setStatus(hasRecognized || hasManualRecognitionInput() ? "识别结果已编辑，点击生成" : "继续填写识别结果和主文案");
  });
});

referenceUrlInput.addEventListener("input", () => {
  updateReferenceUrlPreview();
  markReferencesChanged();
});

providerSelect.addEventListener("change", () => {
  hasRecognized = false;
  setRecognitionState("idle");
  if (hasManualRecognitionInput()) {
    promptOutput.value = buildPrompt(activeStyle);
  } else {
    clearRecognitionFields();
  }
  const hasReference = sourceImage || referenceUrlInput.value.trim();
  setStatus(hasReference ? "服务商已切换，请点击识别上传图片" : "准备 API");
});

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("is-dragging");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("is-dragging");
});

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("is-dragging");
  loadFile(event.dataTransfer.files[0]);
});

drawStarterState();
