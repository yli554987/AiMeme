const imageInput = document.querySelector("#imageInput");
const dropZone = document.querySelector("#dropZone");
const sourcePreview = document.querySelector("#sourcePreview");
const subtitleInput = document.querySelector("#subtitleInput");
const captionInput = document.querySelector("#captionInput");
const adObjectInput = document.querySelector("#adObjectInput");
const productUsageInput = document.querySelector("#productUsageInput");
const characterInput = document.querySelector("#characterInput");
const sceneInput = document.querySelector("#sceneInput");
const personThumb = document.querySelector("#personThumb");
const providerSelect = document.querySelector("#providerSelect");
const apiKeyInput = document.querySelector("#apiKeyInput");
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

const generatedApiImages = new Map();
let sourceImage = null;
let sourceFile = null;
let adImageFile = null;
let adImage = null;
let activeStyle = "real";
let hasGeneratedSticker = false;
let hasRecognized = false;
let recognitionPromise = null;
let recognitionMeta = {};
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
  if (productUsageInput) productUsageInput.value = "";
  recognitionMeta = {};
  promptOutput.value = "先填 API Key 和服务商，上传视频截图/广告物品图，然后点击“识别上传图片”。识别完成后这里会生成可编辑的个性化 Prompt，再点击生成贴纸表情包。";
}

function markReferencesChanged() {
  hasRecognized = false;
  generatedApiImages.clear();
  showCanvasPreview();
  setDownloadReady(false);
  setRecognitionState("idle");
  clearRecognitionFields();
  setStatus(sourceImage ? "素材已上传，请点击识别上传图片" : "待上传");
}

async function runRecognition({ requireApi = false } = {}) {
  if (!sourceImage) {
    setStatus("请先上传视频截图");
    return false;
  }

  const apiKey = apiKeyInput.value.trim();
  const provider = providerSelect.value;
  if (provider === "minimax") {
    hasRecognized = false;
    setRecognitionState("idle");
    setStatus("MiniMax image-01 不能识别图片和生成 Prompt，请切换 OpenAI 或 Qwen 完成识别");
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
    .then(async (result) => {
      setStatus("文本模型正在生成生图 Prompt...");
      const promptDraft = await generatePromptDraft(provider, apiKey, result);
      applyRecognitionResult(result, promptDraft);
      hasRecognized = true;
      setRecognitionState("done");
      setStatus("AI 已完成识别和 Prompt 生成，请检查后生成");
      return true;
    })
    .catch((error) => {
      hasRecognized = false;
      setRecognitionState("idle");
      setStatus("识别失败");
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

function getRecognitionInstruction() {
  return [
    "你是腾讯视频 AI 贴纸表情包功能的视觉理解模块。",
    "只做图片事实识别：人物、场景、动作/表情、截图字幕 OCR、广告产品图里的商品或品牌视觉元素。",
    "必须真实分析用户上传的视频截图和可选广告产品图，不要使用默认示例，不要补造商品、品牌或文案。",
    "不要生成生图 prompt，不要做营销创意推理，不要输出产品植入策略。",
    "必须只返回 JSON，不要 Markdown，不要解释。",
    "JSON 字段：",
    "{",
    '  "structured_description": "基于图片事实的标准化描述",',
    '  "character": "人物身份、人数、外观和画面主体；不确定就客观描述",',
    '  "scene": "场景和环境",',
    '  "action": "人物动作和表情，尽量客观",',
    '  "subtitle": "从截图中 OCR 出来的原始台词；如果看不清就写空字符串",',
    '  "ad_object": "广告产品图中实际识别到的商品/品牌/包装视觉元素；没有广告产品图或看不清就写空字符串",',
    '  "ad_visual_detail": "广告产品的颜色、形态、包装、Logo、文字等可见细节；没有就写空字符串"',
    "}",
  ].join("\n");
}

function getVisionContentForOpenAI(text) {
  const content = [{ type: "text", text }];
  const mainImage = sourceImage?.src;
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
  const mainImage = sourceImage?.src;
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
    result?.ad_object,
    result?.structured_description,
    result?.ad_visual_detail,
  ]
    .map((value) => normalizeStickerText(value))
    .filter(Boolean);
  if (!values.length) return false;
  return values.some((value) => !/无图片|没有图片|无法查看|无法读取|no image|image data/i.test(value));
}

async function generatePromptDraft(provider, apiKey, recognition) {
  if (provider === "openai-gpt-image-2") return generatePromptDraftWithOpenAI(apiKey, recognition);
  if (provider === "qwen-image") return generatePromptDraftWithQwen(apiKey, recognition);
  throw new Error("当前服务商没有接入识别后的文本 Prompt 生成，请切换 OpenAI 或通义千问。");
}

function getPromptDraftInstruction(recognition) {
  const visualJson = JSON.stringify(recognition, null, 2);
  const hasAdReference = Boolean(adImageFile);
  return [
    "你是腾讯视频 AI 贴纸表情包功能的 Prompt 生成模块。",
    "输入是视觉模型识别出的 JSON。请只基于这些识别事实，结合贴纸表情包目标，生成最终可直接发送给生图模型的 prompt。",
    "所有输出字段都必须使用简体中文。除真实品牌名/包装文字外，不要使用英文句子。",
    "不要加入未识别到的商品、品牌、颜色、包装或人物身份。没有广告产品图时，不要硬塞广告商品。",
    "主文案由你生成，不要把文案创意交给生图模型。主文案需要短、自然、适合聊天表达；可以结合字幕语义、人物动作/表情和广告产品语义，但不要复制动作/场景描述当标题。",
    hasAdReference
      ? "用户上传了广告产品图，请给出产品自然植入策略：handheld / wearable / corner / background 中选一个，并可附短说明。"
      : "用户没有上传广告产品图，product_usage 必须写空字符串。",
    "image_prompt 必须是完整生图 prompt，并且必须包含以下硬性要求：",
    "1. 用中文直接画面生成指令写，不要写成分析过程、规则列表或给模型看的元指令。",
    "2. 开头明确写“方形透明背景 PNG 贴纸表情包”。",
    "3. 明确主体是贴纸抠图效果，不是矩形照片；人物/商品外轮廓有厚白边贴纸描边和干净阴影。",
    "4. 大致参考上传视频截图中的人物、画面关系和动作/表情，并具体描述动作可以是什么样的。",
    "5. 贴纸中唯一文字是尖括号中的大标题，例如 <别当两面派>，只渲染一次。",
    "6. 有广告产品图时，使用识别到的实际产品/品牌元素，自然植入且不遮挡人物脸部。",
    "输出必须是 JSON，不要 Markdown，不要解释。",
    "JSON 字段：",
    "{",
    '  "main_caption": "最终贴纸大标题，中文 2 到 8 个字",',
    '  "product_usage": "广告产品自然植入方式；没有广告产品图时写空字符串",',
    '  "image_prompt": "最终生图 prompt，必须把 main_caption 放在尖括号中且要求只出现一次"',
    "}",
    "视觉识别 JSON：",
    visualJson,
  ].join("\n");
}

async function generatePromptDraftWithOpenAI(apiKey, recognition) {
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
        { role: "system", content: "你只输出合法 JSON，所有字段必须使用简体中文。" },
        { role: "user", content: getPromptDraftInstruction(recognition) },
      ],
    }),
  });
  return parsePromptDraft(extractChatText(result), "OpenAI Prompt 生成");
}

async function generatePromptDraftWithQwen(apiKey, recognition) {
  const result = await fetchJson("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "qwen-plus",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "你只输出合法 JSON，所有字段必须使用简体中文。" },
        { role: "user", content: getPromptDraftInstruction(recognition) },
      ],
    }),
  });
  return parsePromptDraft(extractChatText(result), "通义千问 Prompt 生成");
}

function parsePromptDraft(text, providerName) {
  const raw = String(text || "").trim();
  const jsonText = raw.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] || raw.match(/\{[\s\S]*\}/)?.[0] || raw;
  try {
    const result = JSON.parse(jsonText);
    if (!normalizeStickerText(result.main_caption) || !normalizeStickerText(result.image_prompt)) throw new Error("empty");
    validateImagePromptDraft(result);
    return result;
  } catch {
    throw new Error(`${providerName} 没有返回可解析的 Prompt JSON：${raw.slice(0, 600)}`);
  }
}

function validateImagePromptDraft(result) {
  const caption = normalizeStickerText(result.main_caption);
  const prompt = normalizeStickerText(result.image_prompt);
  if (!/[\u4e00-\u9fa5]/.test(prompt)) throw new Error("prompt-not-chinese");
  if (!prompt.includes(`<${caption}>`)) throw new Error("prompt-missing-caption");
  if (!/贴纸|表情包/.test(prompt)) throw new Error("prompt-missing-sticker");
  if (!/透明背景|透明底/.test(prompt)) throw new Error("prompt-missing-transparent");
  if (!/白边|白色描边|厚白描边/.test(prompt)) throw new Error("prompt-missing-white-outline");
}

function applyRecognitionResult(result, promptDraft = {}) {
  const character = normalizeStickerText(result.character);
  const scene = normalizeStickerText(result.scene);
  const action = normalizeStickerText(result.action);
  const subtitle = normalizeStickerText(result.subtitle);
  const mainCaption = normalizeStickerText(promptDraft.main_caption);
  const adObject = normalizeStickerText(result.ad_object);
  const productUsage = normalizeStickerText(promptDraft.product_usage);
  const imagePrompt = normalizeStickerText(promptDraft.image_prompt);

  recognitionMeta = {
    ...result,
    mainCaption,
    productUsage,
    generatedPrompt: imagePrompt,
  };

  if (characterInput) characterInput.value = character;
  if (sceneInput) sceneInput.value = scene;
  subtitleInput.value = action || subtitle;
  captionInput.value = mainCaption;
  adObjectInput.value = adObject;
  if (productUsageInput) productUsageInput.value = productUsage;
  promptOutput.value = imagePrompt;
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
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  canvasStage.classList.remove("has-result");
  if (outputPlaceholder) {
    outputPlaceholder.hidden = false;
    outputPlaceholder.textContent = "贴纸结果区";
  }
  clearRecognitionFields();
  setDownloadReady(false);
  setRecognitionState("idle");
}

function getPrimaryCaption() {
  return normalizeStickerText(captionInput.value);
}

function getSceneLine() {
  return normalizeStickerText(subtitleInput.value);
}

function normalizeStickerText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function showOutputProcess(message) {
  showCanvasPreview();
  canvasStage.classList.remove("has-result");
  if (outputPlaceholder) {
    outputPlaceholder.hidden = false;
    outputPlaceholder.textContent = message;
  }
}

function buildPrompt(styleId = getSelectedStyle()) {
  return normalizeStickerText(recognitionMeta.generatedPrompt);
}

async function generateSticker() {
  const provider = providerSelect.value;
  await generateWithApi(provider);
}

async function generateWithApi(provider) {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    setStatus("请填写 API Key");
    return;
  }

  if (!sourceImage) {
    setStatus("请先上传视频截图");
    return;
  }

  if (sourceImage && !hasRecognized && !hasManualRecognitionInput()) {
    setStatus("请先识别上传图片，让文本模型生成生图 Prompt");
    return;
  }

  activeStyle = getSelectedStyle();
  const prompt = buildPrompt(activeStyle);
  if (!prompt) {
    setStatus("请先点击识别上传图片，生成生图 Prompt");
    return;
  }
  promptOutput.value = prompt;
  setStatus("请求生图中...");
  generateBtn.disabled = true;
  setDownloadReady(false);
  generatedApiImages.clear();
  showOutputProcess("生成中...");

  try {
    setStatus("生成真人广告贴纸中...");
    const imageUrl = await requestImageGeneration(provider, apiKey, prompt);
    generatedApiImages.set(activeStyle, imageUrl);
    setApiImage(imageUrl);
    promptOutput.value = prompt;
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
        prompt_extend: false,
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
}

function clearAll() {
  sourceImage = null;
  sourceFile = null;
  adImageFile = null;
  adImage = null;
  activeStyle = "real";
  hasRecognized = false;
  generatedApiImages.clear();
  showCanvasPreview();
  setDownloadReady(false);
  setRecognitionState("idle");

  imageInput.value = "";
  adImageInput.value = "";
  apiKeyInput.value = "";
  subtitleInput.value = "";
  captionInput.value = "";
  adObjectInput.value = "";
  if (productUsageInput) productUsageInput.value = "";
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
  recognitionMeta = {};
  setRecognitionState("idle");
  setStatus(sourceImage ? "API Key 已更新，请点击识别上传图片" : "准备 API");
});

document.querySelectorAll("input[name='style']").forEach((input) => {
  input.addEventListener("change", () => {
    activeStyle = input.value;
    if (recognitionMeta.generatedPrompt) {
      promptOutput.value = buildPrompt(input.value);
    }
    setDownloadReady(false);
    setStatus(recognitionMeta.generatedPrompt ? "风格已更新，点击生成" : "风格已更新，请先识别上传图片生成 Prompt");
  });
});

[subtitleInput, captionInput, adObjectInput, productUsageInput, characterInput, sceneInput].forEach((input) => {
  if (!input) return;
  input.addEventListener("input", () => {
    recognitionMeta.generatedPrompt = "";
    promptOutput.value = "识别结果已编辑，请重新点击“识别上传图片”，让文本模型生成新的生图 Prompt。";
    setDownloadReady(false);
    setStatus("识别结果已编辑，请重新识别生成 Prompt");
  });
});

providerSelect.addEventListener("change", () => {
  hasRecognized = false;
  recognitionMeta = {};
  setRecognitionState("idle");
  clearRecognitionFields();
  const hasReference = sourceImage;
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
