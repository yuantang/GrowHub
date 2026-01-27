# -*- coding: utf-8 -*-
# Copyright (c) 2025 relakkes@gmail.com
#
# This file is part of MediaCrawler project.
# Repository: https://github.com/NanmiCoder/MediaCrawler/blob/main/config/base_config.py
# GitHub: https://github.com/NanmiCoder
# Licensed under NON-COMMERCIAL LEARNING LICENSE 1.1
#

# 声明：本代码仅供学习和研究目的使用。使用者应遵守以下原则：
# 1. 不得用于任何商业用途。
# 2. 使用时应遵守目标平台的使用条款和robots.txt规则。
# 3. 不得进行大规模爬取或对平台造成运营干扰。
# 4. 应合理控制请求频率，避免给目标平台带来不必要的负担。
# 5. 不得用于任何非法或不当的用途。
#
# 详细许可条款请参阅项目根目录下的LICENSE文件。
# 使用本代码即表示您同意遵守上述原则和LICENSE中的所有条款。

# 基础配置
PLATFORM = "xhs"  # 平台，xhs | dy | ks | bili | wb | tieba | zhihu
KEYWORDS = "编程副业,编程兼职"  # 关键词搜索配置，以英文逗号分隔
LOGIN_TYPE = "qrcode"  # qrcode or phone or cookie
COOKIES = ""
PROJECT_ID = 0  # 关联的项目 ID（用于数据过滤）
CRAWLER_TYPE = (
    "search"  # 爬取类型，search(关键词搜索) | detail(帖子详情)| creator(创作者主页数据)
)
PURPOSE = "general" # creator/hotspot/sentiment/general
MIN_FANS = 0
MAX_FANS = 0
REQUIRE_CONTACT = False
SENTIMENT_KEYWORDS = []
# 是否开启 IP 代理
ENABLE_IP_PROXY = False

# 代理IP池数量
IP_PROXY_POOL_COUNT = 2

# 代理IP提供商名称
# 代理IP提供商名称
IP_PROXY_PROVIDER_NAME = "kuaidaili"  # kuaidaili | wandouhttp

# Sign Server Configuration (Ref MediaCrawlerPro)
SIGN_SERVER_HOST: str = "127.0.0.1"
SIGN_SERVER_PORT: int = 8045
ENABLE_SIGN_SERVER: bool = False

# ==================== System & Browser Fingerprint Constants ====================
# Centralized source of truth for Anti-Bot Fingerprinting
# MUST match exactly between Browser Context and API Headers

# P7 Fix: Use multiple Chrome versions and randomly select at startup
import random
_CHROME_VERSIONS = ["126.0.0.0", "127.0.0.0", "128.0.0.0", "129.0.0.0", "130.0.0.0", "131.0.0.0"]
_SELECTED_CHROME_VERSION = random.choice(_CHROME_VERSIONS)

DEFAULT_USER_AGENT = f"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{_SELECTED_CHROME_VERSION} Safari/537.36"
BROWSER_VERSION = _SELECTED_CHROME_VERSION
BROWSER_NAME = "Chrome"
OS_NAME = "Mac OS"
OS_VERSION = "10.15.7"

# ==================== 签名服务配置 ====================
# 是否启用独立签名服务（用于去除Playwright依赖）
# 启用后，爬虫将通过HTTP调用签名服务获取签名，而非本地Playwright
ENABLE_SIGN_SERVICE = False

# 签名服务地址
SIGN_SERVICE_URL = "http://localhost:8081"

# 设置为True不会打开浏览器（无头浏览器）
# 设置False会打开一个浏览器
# 小红书如果一直扫码登录不通过，打开浏览器手动过一下滑动验证码
# 抖音如果一直提示失败，打开浏览器看下是否扫码登录之后出现了手机号验证，如果出现了手动过一下再试。
HEADLESS = False

# 是否保存登录状态
SAVE_LOGIN_STATE = True

# ==================== CDP (Chrome DevTools Protocol) 配置 ====================
# 是否启用CDP模式 - 使用用户现有的Chrome/Edge浏览器进行爬取，提供更好的反检测能力
# 启用后将自动检测并启动用户的Chrome/Edge浏览器，通过CDP协议进行控制
# 这种方式使用真实的浏览器环境，包括用户的扩展、Cookie和设置，大大降低被检测的风险
#
# ⚠️ 注意：CDP模式可能导致签名JS(mnsv2)加载失败，推荐设为 False
# 如需使用 CDP 模式，请确保浏览器中已打开小红书页面且加载完成
# 2026-01-11: Enabled to bypass Douyin's anti-bot detection on Playwright
ENABLE_CDP_MODE = True


# CDP调试端口，用于与浏览器通信
# 如果端口被占用，系统会自动尝试下一个可用端口
CDP_DEBUG_PORT = 9222

# 自定义浏览器路径（可选）
# 如果为空，系统会自动检测Chrome/Edge的安装路径
# Windows示例: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
# macOS示例: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
CUSTOM_BROWSER_PATH = ""

# CDP模式下是否启用无头模式
# 注意：即使设置为True，某些反检测功能在无头模式下可能效果不佳
CDP_HEADLESS = False

# 浏览器启动超时时间（秒）
BROWSER_LAUNCH_TIMEOUT = 60

# 是否在程序结束时自动关闭浏览器
# 设置为False可以保持浏览器运行，便于调试
AUTO_CLOSE_BROWSER = True

# 数据保存类型选项配置,支持五种类型：csv、db、json、sqlite、excel, 最好保存到DB，有排重的功能。
SAVE_DATA_OPTION = "sqlite"  # csv or db or json or sqlite or excel

# 用户浏览器缓存的浏览器文件配置
USER_DATA_DIR = "%s_user_data_dir"  # %s will be replaced by platform name

# 爬取开始页数 默认从第一页开始
START_PAGE = 1

# 爬取视频/帖子的数量控制
CRAWLER_MAX_NOTES_COUNT = 15

# ==================== 互动筛选配置 ====================
# 互动量筛选阈值 (0 表示不限制)
MIN_LIKES_COUNT = 0       # 最小点赞数
MAX_LIKES_COUNT = 0       # 最大点赞数
MIN_SHARES_COUNT = 0      # 最小分享数
MAX_SHARES_COUNT = 0      # 最大分享数
MIN_COMMENTS_COUNT = 0    # 最小评论数
MAX_COMMENTS_COUNT = 0    # 最大评论数
MIN_FAVORITES_COUNT = 0   # 最小收藏数
MAX_FAVORITES_COUNT = 0   # 最大收藏数
DEDUPLICATE_AUTHORS = False  # 博主去重：每个博主只保留一条内容

# ==================== 时间筛选配置 ====================
START_TIME = ""  # 开始时间 YYYY-MM-DD or YYYY-MM-DD HH:MM:SS
END_TIME = ""    # 结束时间

# ==================== 博主与舆情配置 ====================
MIN_FANS_COUNT = 0       # 创作者最小粉丝数
MAX_FANS_COUNT = 0       # 创作者最大粉丝数
REQUIRE_CONTACT = False  # 是否要求有联系方式
SENTIMENT_KEYWORDS = []  # 舆情监控敏感词列表

# 并发爬虫数量控制
MAX_CONCURRENCY_NUM = 1

# 是否开启爬媒体模式（包含图片或视频资源），默认不开启爬媒体
ENABLE_GET_MEIDAS = False

# 是否开启爬评论模式, 默认开启爬评论
ENABLE_GET_COMMENTS = True

# 爬取一级评论的数量控制(单视频/帖子)
CRAWLER_MAX_COMMENTS_COUNT_SINGLENOTES = 10

# 是否开启爬二级评论模式, 默认不开启爬二级评论
# 老版本项目使用了 db, 则需参考 schema/tables.sql line 287 增加表字段
ENABLE_GET_SUB_COMMENTS = False

# Aliases for compatibility
PER_NOTE_MAX_COMMENTS_COUNT = CRAWLER_MAX_COMMENTS_COUNT_SINGLENOTES
CRAWLER_TIME_SLEEP = 1.0  # Fixed sleep time in seconds

# 词云相关
# 是否开启生成评论词云图
ENABLE_GET_WORDCLOUD = False
# 自定义词语及其分组
# 添加规则：xx:yy 其中xx为自定义添加的词组，yy为将xx该词组分到的组名。
CUSTOM_WORDS = {
    "零几": "年份",  # 将“零几”识别为一个整体
    "高频词": "专业术语",  # 示例自定义词
}

# 停用(禁用)词文件路径
STOP_WORDS_FILE = "./docs/hit_stopwords.txt"

# 中文字体文件路径
FONT_PATH = "./docs/STZHONGS.TTF"

# 爬取间隔时间（基础值，会加入随机抖动）
CRAWLER_MAX_SLEEP_SEC = 3  # A2 优化: 从 2s 增加到 3s

# 全局频率限制 (每秒请求数 TPS/RPS)
GLOBAL_TPS_LIMIT = 1.0  # 建议保持在 1.0~2.0 之间，降低风控风险

# A2 优化: 账号冷却时间配置
ACCOUNT_COOLDOWN_SECONDS = 300  # 默认 5 分钟冷却
ACCOUNT_MAX_DAILY_REQUESTS = 500  # A3 优化: 单账号每日请求上限

# ==================== HomeFeed 首页推荐配置 ====================
# 首页推荐最大爬取页数
HOMEFEED_MAX_PAGES = 10

# 首页推荐分类 (小红书)
# 可选值: homefeed_recommend, homefeed.fashion_v3, homefeed.food_v3 等
HOMEFEED_CATEGORY = "homefeed_recommend"

from .bilibili_config import *
from .xhs_config import *
from .dy_config import *
from .ks_config import *
from .weibo_config import *
from .tieba_config import *
from .zhihu_config import *
