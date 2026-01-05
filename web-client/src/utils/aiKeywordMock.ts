
// Dictionary based AI simulation for keyword recommendation

export const PRESET_KEYWORDS = {
    risk: {
        default: ['避雷', '差评', '踩雷', '假货', '智商税', '退货', '投诉', '无语', '后悔'],
        cosmetics: ['烂脸', '过敏', '闷痘', '假滑', '刺痛', '拔干', '搓泥', '荧光剂', '激素', '不吸收', '厚重'],
        electronics: ['故障', '发热', '断连', '异响', '死机', '漏电', '品控差', '翻新', '卡顿', '续航崩'],
        food: ['拉肚子', '异物', '变质', '发霉', '难吃', '科技与狠活', '添加剂', '不卫生'],
        clothing: ['起球', '掉色', '透肉', '版型差', '实物不符', '缩水', '线头', '廉价感']
    },
    trend: {
        default: ['必买', '测评', '推荐', '攻略', '教程', '平替', '红榜', '种草', '开箱'],
        cosmetics: ['早C晚A', '沉浸式护肤', '伪素颜', '妈生皮', '美白', '抗老', '刷酸', '有效护肤', '低成本变美'],
        electronics: ['拆解', '参数对比', '使用技巧', '隐藏功能', '生产力', '桌搭', '数码好物'],
        food: ['探店', '隐藏吃法', '自制', '减脂', '低卡', '巨好吃', '宝藏零食'],
        clothing: ['穿搭', 'OOTD', '显瘦', '梨形身材', '氛围感', '胶囊衣橱', '多巴胺穿搭']
    }
};

export const detectCategory = (query: string): keyof typeof PRESET_KEYWORDS.risk | 'default' => {
    const q = query.toLowerCase();
    if (/(霜|乳|水|精华|面膜|口红|粉底|防晒|妆|脸|眼|唇)/.test(q)) return 'cosmetics';
    if (/(手机|电脑|耳机|键盘|鼠标|相机|手表|平板|数码|iphone|mac)/.test(q)) return 'electronics';
    if (/(吃|喝|味|餐|茶|奶|肉|果|菜|饭)/.test(q)) return 'food';
    if (/(衣|裤|裙|鞋|帽|包|穿|搭)/.test(q)) return 'clothing';
    return 'default';
};

export const getAIKeywords = (query: string, mode: 'risk' | 'trend'): string[] => {
    const category = detectCategory(query);
    const presets = PRESET_KEYWORDS[mode][category];
    const defaults = PRESET_KEYWORDS[mode]['default'];
    // Merge and dedupe simple
    return Array.from(new Set([...presets, ...defaults]));
};
