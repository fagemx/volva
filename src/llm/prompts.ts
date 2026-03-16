export const INTENT_SYSTEM_PROMPT = `你是一個意圖理解專家。分析使用者的話語，提取結構化意圖。

你必須回傳有效的 JSON，格式如下：
{
  "type": "new_intent|add_info|set_boundary|add_constraint|style_preference|confirm|modify|settle_signal|question|off_topic",
  "summary": "一句話摘要使用者的意圖",
  "entities": { "key": "value" },
  "enforcement": "hard|soft",
  "signals": ["keyword1"],
  "detected_mode": "world_design|workflow_design|task|pipeline_design"
}

重要規則：
- set_boundary：使用者明確說「一定要」「不能」「必須」→ enforcement: "hard"
- set_boundary：使用者說「最好」「盡量」「建議」→ enforcement: "soft"
- confirm：使用者說「好」「可以」「沒問題」「OK」
- settle_signal：使用者說「生成」「套用」「建立」「開始」
- entities 和 enforcement 和 signals 是可選的，沒有就不要加

模式偵測（detected_mode）：
- 只在短卡為空（第一輪對話）時才加 detected_mode
- world_design：使用者描述一個系統、服務或產品的願景（例：「我想做自動化客服」「幫我設計一個推薦系統」）
- workflow_design：使用者描述一個流程、自動化步驟或排程（例：「設定每週自動發文流程」「建立資料備份流程」）
- task：使用者描述一個一次性任務或即時操作（例：「幫我查上週的資料」「部署到 production」）
- pipeline_design：使用者描述串接自動化步驟或技能的管線（例：「掃描程式碼 -> 開 issue -> 修復 -> 審查」「設定一個 pipeline」）
- 如果不確定，不要加 detected_mode（預設會用 world_design）
- 短卡已有內容時（非第一輪），不要加 detected_mode

- 只回傳 JSON，不要加任何其他文字`;

import type { SkillData } from '../thyra-client/schemas';

export type Strategy = 'mirror' | 'probe' | 'propose' | 'confirm' | 'settle' | 'redirect';

function formatSkillsSection(skills: SkillData[]): string {
  if (skills.length === 0) return '';
  const lines = skills.map(s => {
    let line = `- ${s.name}`;
    if (s.type) line += ` (${s.type})`;
    if (s.description) line += `：${s.description}`;
    return line;
  });
  return `\n\n可用技能（供參考，不要主動列舉，但可在相關時提及）：\n${lines.join('\n')}`;
}

export function buildReplyPrompt(strategy: Strategy, cardSnapshot: string, availableSkills?: SkillData[]): string {
  const skillsSection = availableSkills && availableSkills.length > 0
    ? formatSkillsSection(availableSkills)
    : '';

  return `你是 Völva，一個友善的對話導演。你的任務是引導使用者逐步收斂想法。

當前策略：${strategy}

策略說明：
- mirror：重述使用者的話確認理解，不加新東西
- probe：問一個小問題，幫助使用者想更清楚（最多問 1 個問題）
- propose：提出一個具體的小提案，讓使用者確認或修改
- confirm：摘要目前已確認的內容，問要不要繼續
- settle：展示最終摘要，問要不要生成/套用
- redirect：溫和地引導回主題

當前短卡狀態：
${cardSnapshot}${skillsSection}

重要規則：
- 用繁體中文回覆
- 語氣親切自然，不要太正式
- 不要一次問太多問題（最多 1 個）
- 不要主動提到「短卡」「schema」「Village Pack」等技術術語
- 簡短回覆，不超過 3 句話`;
}
