export type EvidenceItem = {
  id: string;
  title: string;
  source: string;
  year: string;
  category: string;
  evidenceLevel: string;
  fit: string;
  caution: string;
  insight: string;
  url?: string;
};

export type SearchExperience = {
  query: string;
  specialty: string;
  summary: string;
  clinicianFocus: string[];
  suggestedActions: string[];
  evidence: EvidenceItem[];
};

export type ConsultTrack = {
  phase: string;
  goal: string;
  output: string;
  risk: string;
};

export type ConsultSignal = {
  label: string;
  value: string;
};

export type ConsultEvidenceMatrix = {
  dimension: string;
  guidance: string;
  evidenceSignal: string;
  operationalNote: string;
};

export type PlatformModule = {
  name: string;
  audience: string;
  value: string;
  visualization: string;
};

export type PlatformFlow = {
  title: string;
  trigger: string;
  steps: string[];
};

export type ArchitectureLayer = {
  layer: string;
  capability: string;
  note: string;
};

const evidenceLibrary: Record<string, Omit<SearchExperience, "query">> = {
  oncology: {
    specialty: "肿瘤",
    summary:
      "对于驱动基因阳性肿瘤，优先按分子分型、既往线别、耐药机制和器官功能来收敛方案；结论必须同时给出指南位阶、关键研究结果和中国可及性边界。",
    clinicianFocus: [
      "先确认病理类型、分子分型和既往治疗暴露",
      "对比 NCCN / CSCO / 中国专家共识是否存在推荐差异",
      "单独标记脑转移、肝肾功能下降、PS 较差等特殊人群",
    ],
    suggestedActions: [
      "补充耐药机制检测并校验是否存在 T790M、MET 扩增或其他可靶向位点",
      "按药物可及性输出中国大陆可执行方案清单",
      "对每个方案给出证据等级、PFS/OS 方向性收益和主要毒性提醒",
    ],
    evidence: [
      {
        id: "onc-1",
        title: "EGFR 突变 NSCLC 后线治疗的耐药机制分层路径",
        source: "CSCO 非小细胞肺癌指南",
        year: "2025",
        category: "中国指南",
        evidenceLevel: "高",
        fit: "适用于中国真实临床决策的首轮分流",
        caution: "需结合再活检或液体活检证据，不能仅凭经验切换方案",
        insight:
          "指南强调先识别耐药机制，再决定三代 TKI、化疗联合或双抗路线，避免一刀切进入经验化疗。",
      },
      {
        id: "onc-2",
        title: "后线靶向与化疗联合方案的生存获益比较",
        source: "Journal of Clinical Oncology",
        year: "2024",
        category: "关键研究",
        evidenceLevel: "中高",
        fit: "适合用于比较复治患者的方案强弱",
        caution: "研究入组条件严格，PS 差和合并症患者外推要谨慎",
        insight:
          "对特定亚组显示出更长的无进展生存，但毒性管理和住院资源消耗明显增加。",
      },
      {
        id: "onc-3",
        title: "脑转移患者的局部治疗与系统治疗协同策略",
        source: "中国临床肿瘤学会脑转移共识",
        year: "2024",
        category: "专家共识",
        evidenceLevel: "中",
        fit: "适合需要判断先放疗还是先系统治疗的病例",
        caution: "必须结合症状负担、病灶数量和神经外科评估",
        insight:
          "共识倾向将有症状或高危病灶优先纳入局部控制，再评估系统治疗时机。",
      },
    ],
  },
  cardiovascular: {
    specialty: "心血管",
    summary:
      "对于复杂心血管患者，证据组织应围绕血栓风险、出血风险、器官功能和并发疾病相互制约的关系展开，而不是只给单一用药答案。",
    clinicianFocus: [
      "拆开 ACS、AF、CKD、出血史等共存因素",
      "优先给出抗栓策略的时间轴，而不是静态推荐",
      "输出停药、减量和监测节点",
    ],
    suggestedActions: [
      "先定义患者处于急性期还是维持期",
      "标记高出血风险和高缺血风险的决策阈值",
      "把院内监测要求写进结果页",
    ],
    evidence: [
      {
        id: "cv-1",
        title: "房颤合并冠心病患者抗栓疗程分层建议",
        source: "中华心血管病杂志共识",
        year: "2025",
        category: "中国共识",
        evidenceLevel: "高",
        fit: "适合门诊长期随访和出院带药决策",
        caution: "需要结合 HAS-BLED 与缺血事件史综合判断",
        insight:
          "中国共识更强调缩短三联抗栓时长，并尽快转入更安全的双联或单药方案。",
      },
      {
        id: "cv-2",
        title: "CKD 患者口服抗凝药剂量与结局",
        source: "Circulation",
        year: "2024",
        category: "关键研究",
        evidenceLevel: "中高",
        fit: "适合需要在肾功能下降背景下平衡安全性的患者",
        caution: "不同药物和不同 eGFR 区间外推空间不一致",
        insight:
          "研究提示剂量调整不当与出血、卒中双重风险上升相关，强调规范减量而非经验性停药。",
      },
      {
        id: "cv-3",
        title: "高龄患者 PCI 后抗栓方案简化路径",
        source: "ESC 指南更新摘要",
        year: "2023",
        category: "国际指南",
        evidenceLevel: "中",
        fit: "适合与中国实践做对照参考",
        caution: "药物可及性和医保覆盖要做中国本地化解释",
        insight:
          "国际路径强调早期方案简化，但在中国落地需要考虑随访能力和患者支付能力。",
      },
    ],
  },
  endocrinology: {
    specialty: "内分泌",
    summary:
      "内分泌问题的关键不是给单个药名，而是围绕并发症谱、体重目标、肾心保护和长期依从性组织证据。",
    clinicianFocus: [
      "优先考虑糖尿病并发 ASCVD、HF、CKD 的患者",
      "输出血糖控制之外的器官保护收益",
      "针对老年患者补充低血糖风险提示",
    ],
    suggestedActions: [
      "先识别患者最强适应证而不是从 HbA1c 单点出发",
      "区分口服路径和注射路径的依从性差异",
      "加入中国医保和药价可及性说明",
    ],
    evidence: [
      {
        id: "endo-1",
        title: "T2DM 合并 CKD 患者降糖与肾保护策略",
        source: "中华糖尿病杂志指南解读",
        year: "2025",
        category: "中国指南",
        evidenceLevel: "高",
        fit: "适用于门诊慢病管理和联合用药调整",
        caution: "需要基于 eGFR 和白蛋白尿分层",
        insight:
          "中国路径正在从单纯控糖转向器官保护优先，SGLT2i 与 GLP-1RA 的排序更依赖并发症结构。",
      },
      {
        id: "endo-2",
        title: "GLP-1RA 在肥胖和心血管高风险患者中的综合收益",
        source: "NEJM",
        year: "2024",
        category: "关键研究",
        evidenceLevel: "中高",
        fit: "适合需要兼顾减重和心血管获益的患者",
        caution: "消化道不良反应与长期依从性需提前说明",
        insight:
          "研究支持其在高危人群中的综合获益，但中国场景需补充支付能力和持续供药稳定性评估。",
      },
      {
        id: "endo-3",
        title: "老年糖尿病患者去强化治疗建议",
        source: "老年内分泌共识",
        year: "2024",
        category: "专家共识",
        evidenceLevel: "中",
        fit: "适用于多病共存和低血糖风险较高人群",
        caution: "要结合认知功能、照护条件和预期寿命",
        insight:
          "共识强调目标回撤和减少复杂方案，是中国基层和社区管理的重要抓手。",
      },
    ],
  },
  infection: {
    specialty: "感染",
    summary:
      "感染场景的核心价值是把病原学、耐药谱、感染部位和器官功能约束放到一个可执行框架里，而不是泛泛推荐抗菌药。",
    clinicianFocus: [
      "先区分社区获得、院内获得和免疫抑制状态",
      "把抗菌覆盖范围与降阶梯策略同时给出",
      "突出耐药风险和本院常见病原学差异",
    ],
    suggestedActions: [
      "明确经验性治疗与病原学回报后的调整节点",
      "对肝肾功能异常做剂量提醒",
      "提示何时需要感染科会诊",
    ],
    evidence: [
      {
        id: "inf-1",
        title: "重症感染经验性抗菌治疗分层建议",
        source: "国家抗菌药物临床应用指导原则",
        year: "2024",
        category: "国家规范",
        evidenceLevel: "高",
        fit: "适合 ICU 与高风险感染患者初始治疗",
        caution: "需结合当地耐药数据，不能机械照搬全国建议",
        insight:
          "规范强调先覆盖致命风险，再尽快根据培养和临床反应降阶梯。",
      },
      {
        id: "inf-2",
        title: "CRE 感染联合治疗的真实世界结局",
        source: "Clinical Infectious Diseases",
        year: "2024",
        category: "真实世界研究",
        evidenceLevel: "中",
        fit: "适合多重耐药高风险患者决策参考",
        caution: "病例异质性大，需结合本地药敏和药物可及性",
        insight:
          "联合治疗在特定严重感染中显示优势，但毒性和成本显著上升，应由专科团队把关。",
      },
      {
        id: "inf-3",
        title: "免疫抑制宿主侵袭性真菌感染的早期识别要点",
        source: "中国侵袭性真菌病诊治共识",
        year: "2025",
        category: "中国共识",
        evidenceLevel: "中高",
        fit: "适用于血液、肿瘤和 ICU 高危患者",
        caution: "影像和生物标志物解释需结合病程阶段",
        insight:
          "早期识别和经验性覆盖的时间窗比具体药物选择更影响结局。",
      },
    ],
  },
};

const consultTracks: ConsultTrack[] = [
  {
    phase: "问题拆解",
    goal: "把原始问题转成分型、线别、并发症和证据边界四个子问题",
    output: "结构化病例摘要与需要补充的数据点",
    risk: "输入缺少关键变量时禁止直接给治疗建议",
  },
  {
    phase: "证据检索",
    goal: "同时检索中国指南、国际指南、关键 RCT 和真实世界研究",
    output: "带出处的证据池与时间线",
    risk: "低质量研究不能与高等级指南并列展示",
  },
  {
    phase: "决策合成",
    goal: "围绕适应人群、毒性、可及性和支付能力合成可执行方案",
    output: "临床可讨论的方案对比表",
    risk: "必须显式标注超说明书、证据空白和高风险假设",
  },
  {
    phase: "治理审计",
    goal: "记录引用、版本、医生反馈和输出日志",
    output: "可审计结果页和质控闭环",
    risk: "高风险问题进入人工复核或拒答通道",
  },
];

const consultSignals: ConsultSignal[] = [
  { label: "目标市场", value: "中国执业医生与三甲医院专科科室" },
  { label: "首个切口", value: "肿瘤专科，优先肺癌与乳腺癌" },
  { label: "模式映射", value: "证据搜索 + DeepConsult + 医院知识底座" },
  { label: "首版数据源", value: "中国指南、NMPA/FDA 正式文件、PubMed 摘要级证据、中国人群分层信号" },
];

const consultMatrix: ConsultEvidenceMatrix[] = [
  {
    dimension: "指南优先级",
    guidance: "中国指南优先，国际指南做对照解释",
    evidenceSignal: "标明是否适配中国药物可及性",
    operationalNote: "先解决医生能不能用，再讨论理论最佳方案",
  },
  {
    dimension: "文献整合",
    guidance: "RCT、Meta、真实世界研究分层展示",
    evidenceSignal: "不混合不同证据等级的结论强度",
    operationalNote: "让医生一眼区分硬证据和补充证据",
  },
  {
    dimension: "病例解释",
    guidance: "把器官功能、特殊人群和并发症作为单独变量",
    evidenceSignal: "给出适用边界和不适用边界",
    operationalNote: "减少 AI 幻觉式一刀切建议",
  },
  {
    dimension: "风险治理",
    guidance: "高风险问题默认保守输出",
    evidenceSignal: "出现证据冲突时突出冲突点而非强行统一",
    operationalNote: "把医疗责任边界写进产品体验",
  },
];

export const brandSummary = {
  name: "明证",
  englishName: "MingEvidence",
  oneLiner: "面向中国医生的 AI 临床证据平台",
  promise: "让每一次临床判断，都有清晰来源、适用边界和中国本地化解释。",
};

export const platformModules: PlatformModule[] = [
  {
    name: "临床搜索入口",
    audience: "医生",
    value: "用自然语言问题直接进入临床证据、指南位阶、药品边界和中国可及性解释。",
    visualization: "搜索框 + 证据卡片流 + 指南/标签/研究分栏结果。",
  },
  {
    name: "病例工作台",
    audience: "医生",
    value: "围绕单个患者串起问题拆解、方案对比、病程记录、监测和随访，不再是一次性问答。",
    visualization: "病程时间轴 + 关键指标面板 + 下一步任务清单。",
  },
  {
    name: "药品与标签中心",
    audience: "医生 / 药师",
    value: "统一查看 NMPA、FDA、说明书、适应症、剂量、禁忌和支付限制。",
    visualization: "双栏标签对照 + 剂量卡片 + 风险高亮。",
  },
  {
    name: "中国人群预警面板",
    audience: "专科 / MDT",
    value: "把中国人群证据沉淀成风险分层、复发预警、不良事件监测和随访提示。",
    visualization: "风险热图 + 事件时间线 + 分层漏斗。",
  },
  {
    name: "机构治理后台",
    audience: "医院 / 科室管理员",
    value: "管理用户、反馈、审计、高风险问题、内容版本和院内知识接入。",
    visualization: "运营驾驶舱 + 审计列表 + 更新记录。",
  },
];

export const platformFlows: PlatformFlow[] = [
  {
    title: "门诊即时问答",
    trigger: "门诊场景下需要快速给出可解释、可执行的首轮证据答案",
    steps: ["提问", "结构化答案 + 引用", "保存到病例工作台"],
  },
  {
    title: "住院病例研判",
    trigger: "复杂住院患者需要多轮证据核对、药品边界确认和治疗调整",
    steps: ["创建病例会话", "接入诊断/并发症/用药", "输出病程化建议与监测节点"],
  },
  {
    title: "药品标签核查",
    trigger: "医生或药师要核对适应症、剂量、禁忌与中美监管差异",
    steps: ["进入药品中心", "查看 NMPA/FDA 对照", "输出监管边界与临床提示"],
  },
  {
    title: "机构持续更新",
    trigger: "医院需要持续掌握正式源变化和高风险使用情况",
    steps: ["自动刷新正式源", "审查失败源与版本变更", "同步触发公开展示与内部发布"],
  },
];

export const architectureLayers: ArchitectureLayer[] = [
  {
    layer: "体验层",
    capability: "搜索、病例、药品、预警、后台五个工作区",
    note: "以医生任务组织入口，而不是以技术功能组织入口。",
  },
  {
    layer: "应用服务层",
    capability: "身份认证、病例会话、收藏、反馈、审计、通知",
    note: "把搜索结果变成可连续使用的工作流资产。",
  },
  {
    layer: "证据引擎层",
    capability: "query understanding、chunk rerank、标签对照、病程模板、风险分流",
    note: "中国指南优先，监管标签做边界层，PubMed 做研究增强层。",
  },
  {
    layer: "知识底座层",
    capability: "中国指南、NMPA/FDA 文件、PubMed、中国人群分层信号",
    note: "统一 schema、统一版本、统一引用输出。",
  },
  {
    layer: "治理与集成层",
    capability: "高风险拒答、版本审计、机构管理、EHR/SMART on FHIR",
    note: "先做到可信和可审计，再推进医院深度嵌入。",
  },
];

export const landingStats = [
  { label: "目标用户", value: "中国临床医生", detail: "先从肿瘤、心血管、感染切入" },
  { label: "第一版能力", value: "Evidence Search", detail: "给出结构化结论和引文卡片" },
  { label: "第二版能力", value: "DeepConsult", detail: "围绕复杂病例生成研究综述和方案对比" },
  { label: "产品原则", value: "可信可审计", detail: "每条结论必须有出处和边界" },
];

export const productPillars = [
  {
    title: "证据搜索",
    copy:
      "针对临床问题直接返回结构化结论，不只展示文献列表，而是把医生关心的适用人群、疗效强度和风险提示并排呈现。",
  },
  {
    title: "DeepConsult",
    copy:
      "针对复杂病例生成多步研究路径：问题拆解、证据池、方案对比、争议点和下一步检查建议。",
  },
  {
    title: "中国本地化",
    copy:
      "把中国指南、药监说明书、医保和药物可及性纳入同一套答案框架，避免只会翻译海外证据。",
  },
  {
    title: "医疗治理",
    copy:
      "对高风险问题采用保守输出、可追溯引用和日志审计，产品设计从 Day 1 把责任边界写清楚。",
  },
];

export const executionRoadmap = [
  {
    phase: "0-30 天",
    objective: "完成肿瘤专科 MVP 范围定义",
    bullets: [
      "沉淀 100 个真实临床问题样本",
      "形成中国指南与国际文献的内容映射表",
      "确定引用卡片和高风险问题模板",
    ],
  },
  {
    phase: "30-60 天",
    objective: "做出内部试用版",
    bullets: [
      "上线医生问答、证据卡片、反馈闭环",
      "在 10-20 位医生中测试可信度与可读性",
      "建立拒答与降级规则",
    ],
  },
  {
    phase: "60-90 天",
    objective: "进入试点科室",
    bullets: [
      "形成 DeepConsult 病例流",
      "输出 2 家医院的试点方案",
      "准备院内采购与合规说明包",
    ],
  },
];

export function buildSearchExperience(query: string): SearchExperience {
  const loweredQuery = query.toLowerCase();

  let selected = evidenceLibrary.oncology;

  if (
    loweredQuery.includes("房颤") ||
    loweredQuery.includes("冠心病") ||
    loweredQuery.includes("抗栓") ||
    loweredQuery.includes("心衰")
  ) {
    selected = evidenceLibrary.cardiovascular;
  } else if (
    loweredQuery.includes("糖尿病") ||
    loweredQuery.includes("肥胖") ||
    loweredQuery.includes("肾病") ||
    loweredQuery.includes("血糖")
  ) {
    selected = evidenceLibrary.endocrinology;
  } else if (
    loweredQuery.includes("感染") ||
    loweredQuery.includes("抗菌") ||
    loweredQuery.includes("真菌") ||
    loweredQuery.includes("耐药")
  ) {
    selected = evidenceLibrary.infection;
  }

  return {
    query,
    ...selected,
  };
}

export function getConsultTracks() {
  return consultTracks;
}

export function getConsultSignals() {
  return consultSignals;
}

export function getConsultMatrix() {
  return consultMatrix;
}
