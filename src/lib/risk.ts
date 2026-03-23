export type HighRiskDecision =
  | { allowed: true }
  | {
      allowed: false;
      code: string;
      title: string;
      reason: string;
      safeActions: string[];
    };

function includesAny(query: string, words: string[]) {
  return words.some((word) => query.includes(word));
}

export function assessHighRiskQuestion(input: string): HighRiskDecision {
  const query = input.toLowerCase();

  const dosingTerms = ["剂量", "用量", "几毫克", "mg", "mcg", "滴速", "处方", "开药"];
  const vulnerablePopulations = ["孕妇", "妊娠", "哺乳", "儿童", "新生儿", "老年极高龄"];
  const emergencyTerms = ["抢救", "急救", "复苏", "溶栓", "休克", "插管前", "心肺复苏"];
  const highToxicityTerms = ["化疗方案", "静推", "抗凝剂量", "胰岛素调整", "升压药"];
  const offLabelTerms = ["超说明书", "越说明书", "院外自用", "自行用药"];

  if (includesAny(query, emergencyTerms)) {
    return {
      allowed: false,
      code: "emergency-critical-care",
      title: "高风险急救场景已拒答",
      reason: "涉及急救或抢救决策，AI 输出不能替代实时临床判断和院内流程。",
      safeActions: [
        "立即按院内急救规范和专科流程处理",
        "优先查看本院急救用药与抢救路径",
        "必要时启动高级别会诊或上级医生复核",
      ],
    };
  }

  if (
    includesAny(query, dosingTerms) &&
    (includesAny(query, vulnerablePopulations) || includesAny(query, highToxicityTerms))
  ) {
    return {
      allowed: false,
      code: "patient-specific-dosing",
      title: "个体化高风险给药问题已拒答",
      reason: "涉及特殊人群或高毒性药物的个体化剂量决策，必须由医生结合完整病例和说明书处理。",
      safeActions: [
        "先回到说明书、指南和院内药事规则",
        "由具备处方权限的医生结合体重、肝肾功能和并发症复核",
        "如需支持，只检索一般性证据，不直接生成剂量建议",
      ],
    };
  }

  if (includesAny(query, offLabelTerms)) {
    return {
      allowed: false,
      code: "off-label-medication",
      title: "超说明书用药建议已拒答",
      reason: "超说明书用药涉及合规和医疗责任边界，系统不提供直接推荐。",
      safeActions: [
        "回到院内药事管理和伦理审批流程",
        "查询目标药物说明书、指南和专家共识原文",
        "记录证据来源并进行人工会诊决策",
      ],
    };
  }

  return { allowed: true };
}
