export interface Word {
  text: string
  cat: string
}

/** 适合小朋友画、也适合小朋友猜的词，按类别用空格分隔 */
const BANK: Record<string, string> = {
  动物:
    '猫 狗 兔子 老虎 狮子 大象 长颈鹿 熊猫 猴子 斑马 企鹅 海豚 鲸鱼 鲨鱼 乌龟 青蛙 蛇 鸭子 小鸡 公鸡 猪 牛 羊 马 老鼠 松鼠 刺猬 狐狸 狼 袋鼠 考拉 河马 鳄鱼 蝴蝶 蜜蜂 蜗牛 蚂蚁 蜘蛛 瓢虫 螃蟹 章鱼 金鱼 海星 猫头鹰 孔雀 鹦鹉 恐龙 蝙蝠 骆驼 天鹅',
  水果: '苹果 香蕉 西瓜 葡萄 草莓 橘子 梨 桃子 菠萝 樱桃 柠檬 芒果 椰子 猕猴桃 火龙果 哈密瓜 石榴 柿子 荔枝 蓝莓',
  蔬菜: '胡萝卜 白菜 土豆 西红柿 黄瓜 茄子 南瓜 玉米 辣椒 洋葱 蘑菇 西兰花 豌豆 大蒜',
  食物: '蛋糕 冰淇淋 面包 饺子 包子 面条 米饭 汉堡 薯条 披萨 鸡蛋 棒棒糖 饼干 甜甜圈 粽子 月饼 汤圆 糖葫芦 牛奶 果汁 热狗 寿司 爆米花 巧克力',
  日用品:
    '牙刷 牙膏 毛巾 杯子 碗 筷子 勺子 叉子 剪刀 雨伞 钥匙 镜子 梳子 钟 手表 眼镜 帽子 鞋子 袜子 裙子 裤子 衣服 围巾 手套 书包 铅笔 橡皮 尺子 书 台灯 电视 冰箱 电话 手机 电脑 椅子 桌子 床 枕头 门 窗户 沙发 灯泡 气球 蜡烛 扫把 垃圾桶 花瓶 篮子',
  交通: '汽车 公交车 火车 飞机 轮船 自行车 摩托车 地铁 直升机 火箭 消防车 救护车 警车 出租车 卡车 拖拉机 帆船 热气球 滑板 红绿灯',
  自然: '太阳 月亮 星星 云 雨 雪 彩虹 闪电 山 河 大海 树 花 草 叶子 石头 沙滩 火山 瀑布 岛 冰块 雪人 火 风车 仙人掌 向日葵 玫瑰 蘑菇房',
  身体: '眼睛 鼻子 嘴巴 耳朵 手 脚 头发 牙齿 舌头 眉毛 手指 肚子 心',
  玩具与运动: '足球 篮球 乒乓球 羽毛球 风筝 积木 娃娃 泰迪熊 秋千 滑梯 跳绳 陀螺 魔方 游泳 跑步 跳舞 钓鱼 弹钢琴 吉他 鼓 喇叭 机器人 城堡 宝藏',
  人物: '医生 警察 老师 厨师 宇航员 消防员 公主 国王 海盗 小丑 魔术师 超人 天使 外星人 圣诞老人 农民 画家',
  地点: '学校 医院 公园 动物园 超市 房子 桥 灯塔 游乐园 帐篷 教堂 金字塔 长城',
}

export const WORDS: Word[] = Object.entries(BANK).flatMap(([cat, list]) =>
  list
    .split(/\s+/)
    .filter(Boolean)
    .map((text) => ({ text, cat })),
)

/** 抽 n 个不同的词，尽量避开本局用过的；词全用过一遍就重新开始 */
export function pickOptions(n: number, used: string[], rand: () => number): Word[] {
  let pool = WORDS.filter((w) => !used.includes(w.text))
  if (pool.length < n) pool = [...WORDS]
  const out: Word[] = []
  while (out.length < n && pool.length) {
    const i = Math.floor(rand() * pool.length)
    out.push(pool[i])
    pool.splice(i, 1)
  }
  return out
}
