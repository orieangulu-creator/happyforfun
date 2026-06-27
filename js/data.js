// data.js —— 载入运营 agent 产出的真实数据；文件缺失时用内联兜底数据，保证 demo 始终可跑。
(function () {
  // —— 内联兜底（精简，仅当 data/*.json 加载失败时使用；真实数据以 data/ 文件为准）——
  const FALLBACK = {
    libraries: {
      japan: {
        country: "japan", countryNameZh: "日本", updatedAt: "2026-06-26",
        bestSeasons: [
          { season: "spring", reason: "3-4 月樱花季，气候宜人", source: "内联兜底数据" },
          { season: "autumn", reason: "11 月红叶，凉爽少雨", source: "内联兜底数据" }
        ],
        moodTags: ["culture", "food", "scenery", "hotspring"],
        idealDuration: { minDays: 4, maxDays: 8, note: "东京为主可 4-6 天", source: "内联兜底数据" },
        signatureExperiencesByPeriod: [
          { period: "spring", season: "spring", experiences: ["赏樱", "夜樱点灯"], source: "内联兜底数据" },
          { period: "summer", season: "summer", experiences: ["夏日花火大会", "祭典"], source: "内联兜底数据" },
          { period: "autumn", season: "autumn", experiences: ["赏枫", "温泉"], source: "内联兜底数据" },
          { period: "winter", season: "winter", experiences: ["雪景温泉", "新年参拜"], source: "内联兜底数据" }
        ],
        attractions: [
          { id: "jp-senso", name: "浅草寺", region: "东京", summary: "东京最古老的寺庙，雷门与仲见世商店街", suggestedDurationMin: 90, moodTags: ["culture"], source: "内联兜底数据" },
          { id: "jp-shibuya", name: "涩谷十字路口", region: "东京", summary: "世界最繁忙的过街路口，潮流地标", suggestedDurationMin: 60, moodTags: ["explore"], source: "内联兜底数据" },
          { id: "jp-teamlab", name: "teamLab Planets", region: "东京", summary: "沉浸式数字艺术展", suggestedDurationMin: 120, moodTags: ["explore", "scenery"], source: "内联兜底数据" },
          { id: "jp-ueno", name: "上野公园", region: "东京", summary: "博物馆群与赏樱名所", suggestedDurationMin: 120, moodTags: ["scenery", "culture"], source: "内联兜底数据" }
        ],
        foods: [
          { id: "jp-sushi", name: "江户前寿司", type: "和食", region: "东京", reason: "筑地/丰洲一带名店云集", source: "内联兜底数据" },
          { id: "jp-ramen", name: "东京拉面", type: "面食", region: "东京", reason: "酱油拉面发源地", source: "内联兜底数据" }
        ],
        reservations: [
          { id: "jp-teamlab-r", name: "teamLab Planets 门票", region: "东京", method: "官网指定日期时段预约", leadTime: "建议提前 1-2 周", source: "内联兜底数据" }
        ],
        seasonalTips: [
          { season: "spring", tip: "樱花期酒店紧张，尽早预订", source: "内联兜底数据" },
          { season: "autumn", tip: "昼夜温差大，备薄外套", source: "内联兜底数据" }
        ]
      },
      thailand: {
        country: "thailand", countryNameZh: "泰国", updatedAt: "2026-06-26",
        bestSeasons: [
          { season: "winter", reason: "11-2 月凉季，少雨舒适", source: "内联兜底数据" }
        ],
        moodTags: ["relax", "island", "food"],
        idealDuration: { minDays: 4, maxDays: 7, note: "曼谷+周边 4-6 天", source: "内联兜底数据" },
        signatureExperiencesByPeriod: [
          { period: "spring", season: "spring", experiences: ["泼水节(4月)"], source: "内联兜底数据" },
          { period: "summer", season: "summer", experiences: ["雨季瀑布", "室内市集"], source: "内联兜底数据" },
          { period: "autumn", season: "autumn", experiences: ["水灯节(11月)"], source: "内联兜底数据" },
          { period: "winter", season: "winter", experiences: ["海岛", "夜市"], source: "内联兜底数据" }
        ],
        attractions: [
          { id: "th-grandpalace", name: "大皇宫", region: "曼谷", summary: "泰国王室宫殿群与玉佛寺", suggestedDurationMin: 120, moodTags: ["culture"], source: "内联兜底数据" },
          { id: "th-chatuchak", name: "恰图恰周末市集", region: "曼谷", summary: "超大型市集，购物美食", suggestedDurationMin: 150, moodTags: ["shopping", "food"], source: "内联兜底数据" },
          { id: "th-wat-arun", name: "郑王庙", region: "曼谷", summary: "湄南河畔的黎明寺", suggestedDurationMin: 90, moodTags: ["culture", "scenery"], source: "内联兜底数据" }
        ],
        foods: [
          { id: "th-padthai", name: "泰式炒河粉", type: "街头小吃", region: "曼谷", reason: "国民美食", source: "内联兜底数据" },
          { id: "th-tomyum", name: "冬阴功汤", type: "汤", region: "曼谷", reason: "酸辣经典", source: "内联兜底数据" }
        ],
        reservations: [
          { id: "th-dinner-cruise", name: "湄南河晚餐游船", region: "曼谷", method: "在线平台预订", leadTime: "建议提前 3-5 天", source: "内联兜底数据" }
        ],
        seasonalTips: [
          { season: "winter", tip: "凉季最舒适，注意防晒", source: "内联兜底数据" },
          { season: "summer", tip: "雨季多阵雨，备雨具", source: "内联兜底数据" }
        ]
      },
      france: {
        country: "france", countryNameZh: "法国", updatedAt: "2026-06-26",
        bestSeasons: [
          { season: "summer", reason: "5-9 月日照长、气候宜人", source: "内联兜底数据" }
        ],
        moodTags: ["culture", "food", "scenery"],
        idealDuration: { minDays: 5, maxDays: 9, note: "巴黎为主 4-6 天", source: "内联兜底数据" },
        signatureExperiencesByPeriod: [
          { period: "spring", season: "spring", experiences: ["花园季"], source: "内联兜底数据" },
          { period: "summer", season: "summer", experiences: ["塞纳河畔", "露天咖啡"], source: "内联兜底数据" },
          { period: "autumn", season: "autumn", experiences: ["葡萄收获季"], source: "内联兜底数据" },
          { period: "winter", season: "winter", experiences: ["圣诞集市"], source: "内联兜底数据" }
        ],
        attractions: [
          { id: "fr-eiffel", name: "埃菲尔铁塔", region: "巴黎", summary: "巴黎地标，可登顶俯瞰", suggestedDurationMin: 120, moodTags: ["scenery"], source: "内联兜底数据" },
          { id: "fr-louvre", name: "卢浮宫", region: "巴黎", summary: "世界顶级艺术博物馆", suggestedDurationMin: 180, moodTags: ["culture"], source: "内联兜底数据" },
          { id: "fr-notredame", name: "塞纳河 & 西岱岛", region: "巴黎", summary: "河畔漫步与历史街区", suggestedDurationMin: 90, moodTags: ["scenery", "culture"], source: "内联兜底数据" }
        ],
        foods: [
          { id: "fr-croissant", name: "可颂与法式面包", type: "烘焙", region: "巴黎", reason: "街角面包房的日常美味", source: "内联兜底数据" },
          { id: "fr-bistro", name: "法式小酒馆料理", type: "正餐", region: "巴黎", reason: "洋葱汤、油封鸭等经典", source: "内联兜底数据" }
        ],
        reservations: [
          { id: "fr-louvre-r", name: "卢浮宫门票", region: "巴黎", method: "官网预约时段", leadTime: "建议提前 1-2 周", source: "内联兜底数据" }
        ],
        seasonalTips: [
          { season: "summer", tip: "旺季人多，热门景点务必预约", source: "内联兜底数据" },
          { season: "winter", tip: "天黑早，注意行程节奏", source: "内联兜底数据" }
        ]
      }
    },
    holidays: [
      { region: "china", year: 2026, lastReviewed: "2026-06-26", holidays: [
        { id: "cn-2026-national-day", nameZh: "国庆节", start: "2026-10-01", end: "2026-10-07", type: "statutory_holiday", bridgeHint: "前后请几天年假可拼出更长假期", source: "内联兜底数据(按惯例估算)" },
        { id: "cn-2026-labor-day", nameZh: "劳动节", start: "2026-05-01", end: "2026-05-05", type: "statutory_holiday", bridgeHint: "可拼周末", source: "内联兜底数据(按惯例估算)" }
      ]},
      { region: "japan", year: 2026, lastReviewed: "2026-06-26", holidays: [
        { id: "jp-2026-golden-week", nameZh: "黄金周", nameLocal: "ゴールデンウィーク", start: "2026-04-29", end: "2026-05-06", type: "both", destinationImpact: { highlight: "closure_crowd_price", note: "黄金周景点人多、酒店涨价" }, source: "内联兜底数据" }
      ]},
      { region: "thailand", year: 2026, lastReviewed: "2026-06-26", holidays: [
        { id: "th-2026-songkran", nameZh: "宋干节(泼水节)", nameLocal: "สงกรานต์", start: "2026-04-13", end: "2026-04-15", type: "both", destinationImpact: { highlight: "festival", note: "全国泼水庆典，热闹但部分商家休息" }, source: "内联兜底数据" }
      ]},
      { region: "france", year: 2026, lastReviewed: "2026-06-26", holidays: [
        { id: "fr-2026-bastille", nameZh: "国庆日(巴士底日)", nameLocal: "Fête nationale", start: "2026-07-14", end: "2026-07-14", type: "both", destinationImpact: { highlight: "festival", note: "阅兵与烟火，部分机构闭馆" }, source: "内联兜底数据" }
      ]}
    ]
  };

  const DATA = { libraries: {}, holidays: [], manifest: [], geo: { adjacency: {}, combos: [], costTier: {}, flightHoursFromChina: {} }, loaded: false, usingFallback: false };

  async function tryFetch(path) {
    try {
      const r = await fetch(path, { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      return await r.json();
    } catch (e) { return null; }
  }

  DATA.load = async function () {
    const manifest = await tryFetch("data/manifest.json");
    const hol = await tryFetch("data/holidays.json");
    DATA.geo = (await tryFetch("data/geo.json")) || { adjacency: {}, combos: [], costTier: {}, flightHoursFromChina: {} };
    if (manifest && Array.isArray(manifest) && manifest.length) {
      const loaded = await Promise.all(manifest.map(async m => {
        const lib = await tryFetch("data/" + m.id + ".json");
        return lib ? { m, lib } : null;     // 文件缺失则跳过（如欧洲数据尚未就绪）
      }));
      const ok = loaded.filter(Boolean);
      if (ok.length) {
        DATA.libraries = {}; DATA.manifest = [];
        ok.forEach(({ m, lib }) => { DATA.libraries[m.id] = lib; DATA.manifest.push(m); });
        DATA.holidays = hol || FALLBACK.holidays;
        DATA.loaded = true;
        return DATA;
      }
    }
    // 兜底：manifest/文件都不可用时用内联三国
    DATA.libraries = FALLBACK.libraries;
    DATA.holidays = FALLBACK.holidays;
    DATA.manifest = [{ id: "japan", nameZh: "日本", region: "亚洲" }, { id: "thailand", nameZh: "泰国", region: "亚洲" }, { id: "france", nameZh: "法国", region: "欧洲" }];
    DATA.usingFallback = true; DATA.loaded = true;
    return DATA;
  };

  window.DATA = DATA;
})();
