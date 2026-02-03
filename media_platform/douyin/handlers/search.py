# -*- coding: utf-8 -*-

import asyncio
from datetime import datetime
from typing import List, TYPE_CHECKING
from playwright.async_api import TimeoutError as PlaywrightTimeoutError
import random
import config
from tools import utils
from media_platform.douyin.field import PublishTimeType, SearchSortType, SearchChannelType
from media_platform.douyin.exception import DataFetchError
from var import request_keyword_var, source_keyword_var, min_fans_var, max_fans_var, require_contact_var, sentiment_keywords_var
from media_platform.douyin.extractor import DouyinExtractor

if TYPE_CHECKING:
    from media_platform.douyin.client import DouYinClient
    from media_platform.douyin.processors.aweme_processor import AwemeProcessor
    from media_platform.douyin.processors.comment_processor import CommentProcessor
    from checkpoint.manager import CheckpointManager


class SearchHandler:
    def __init__(
        self,
        dy_client: "DouYinClient",
        checkpoint_manager: "CheckpointManager",
        aweme_processor: "AwemeProcessor",
        comment_processor: "CommentProcessor",
    ):
        self.dy_client = dy_client
        self.checkpoint_manager = checkpoint_manager
        self.aweme_processor = aweme_processor
        self.comment_processor = comment_processor
        self.extractor = DouyinExtractor()

    async def handle(self):
        """
        Execute search crawler
        """
        utils.logger.info("🚀 [SearchHandler] 开始执行抖音关键词搜索任务")
        
        # 1. 准备关键词列表 (Prepare keywords with expansion)
        base_keywords = [k.strip() for k in config.KEYWORDS.split(",") if k.strip()]
        sentiment_keywords = sentiment_keywords_var.get() or []
        
        # 核心逻辑：如果提供了舆情监控词，则进行查询扩展
        # 策略：优先搜索 "关键词 + 舆情词" 的组合，这样召回率最高且最精准
        search_keywords = []
        if sentiment_keywords:
            for kw in base_keywords:
                for skw in sentiment_keywords:
                    # 组合搜索词，例如 "Now冥想 退款"
                    search_keywords.append(f"{kw} {skw}")
            
            # 最后保留原始关键词，作为一个宽泛的补充
            for kw in base_keywords:
                search_keywords.append(kw)
        else:
            search_keywords = base_keywords

        # 归一化去重
        search_keywords = list(dict.fromkeys(search_keywords))

        sentiment_display = ", ".join(sentiment_keywords) if sentiment_keywords else "无"

        utils.logger.info("📋 任务执行条件 (已优化舆情搜索):")
        utils.logger.info(f"   - 原始关键词: {config.KEYWORDS}")
        utils.logger.info(f"   - 搜索词队列: {search_keywords}")
        utils.logger.info(f"   - 舆情监控词: {sentiment_display}")
        utils.logger.info(f"   - 爬取总量限制: {config.CRAWLER_MAX_NOTES_COUNT}")
        utils.logger.info(f"   - 发布时间范围: {config.START_TIME or '不限'} 至 {config.END_TIME or '不限'}")
        utils.logger.info(f"   - 互动要求: 点赞>{config.MIN_LIKES_COUNT}, 评论>{config.MIN_COMMENTS_COUNT}")
        utils.logger.info(f"   - 博主去重: {'开启' if config.DEDUPLICATE_AUTHORS else '关闭'}")
        
        # Get advanced filter vars
        min_fans = min_fans_var.get() or 0
        max_fans = max_fans_var.get() or 0
        require_contact = require_contact_var.get() or False

        # Config validation and defaults
        dy_limit_count = 20 # Douyin search count
        start_page = config.START_PAGE
        
        # Parse start/end time to timestamps for strict comparison
        start_timestamp = 0
        end_timestamp = 0
        
        def parse_timestamp(time_str: str) -> int:
            if not time_str: return 0
            try:
                if len(time_str) <= 10:
                    dt = datetime.strptime(time_str, "%Y-%m-%d")
                else:
                    dt = datetime.strptime(time_str, "%Y-%m-%d %H:%M:%S")
                return int(dt.timestamp())
            except Exception as e:
                utils.logger.error(f"❌ 解析时间 '{time_str}' 失败: {e}")
                return 0

        start_timestamp = parse_timestamp(config.START_TIME)
        end_timestamp = parse_timestamp(config.END_TIME)
        
        utils.logger.info(f"⏰ 解析结果: 起始时间戳={start_timestamp}, 结束时间戳={end_timestamp}")

        # Task-level state
        total_processed_count = 0
        processed_authors = set()
        
        # --- 循环执行搜索词队列 ---
        for keyword in search_keywords:
            if total_processed_count >= config.CRAWLER_MAX_NOTES_COUNT:
                 break
                 
            utils.logger.info(f"🔍 [SearchHandler] 正在搜索: '{keyword}'")
            request_keyword_var.set(keyword)
            source_keyword_var.set(keyword)
            
            # 是否是针对特定舆情词的搜索
            is_expanded_query = any(skw in keyword for skw in sentiment_keywords) if sentiment_keywords else False
            
            checkpoint = await self.checkpoint_manager.find_matching_checkpoint(
                platform="douyin",
                crawler_type="search",
                keywords=keyword,
                project_id=config.PROJECT_ID if hasattr(config, "PROJECT_ID") else None
            )
            
            if not checkpoint:
                checkpoint = await self.checkpoint_manager.create_checkpoint(
                    platform="douyin",
                    crawler_type="search",
                    keywords=keyword,
                    project_id=config.PROJECT_ID if hasattr(config, "PROJECT_ID") else None
                )
            
            # Resume logic
            current_page = checkpoint.current_page
            page = max(current_page, start_page)
            dy_search_id = checkpoint.metadata.get("dy_search_id", "")
            has_more = True
            empty_retry_count = 0 
            
            max_pages = 20
            
            while total_processed_count < config.CRAWLER_MAX_NOTES_COUNT and page < start_page + max_pages:
                utils.logger.info(f"📄 [SearchHandler] 请求第 {page} 页 (合格进度: {total_processed_count}/{config.CRAWLER_MAX_NOTES_COUNT})")
                
                try:
                    # 【优化】优先新鲜度。同时也设置 api_publish_time 
                    api_publish_time = PublishTimeType.UNLIMITED
                    if start_timestamp > 0:
                        now_ts = int(datetime.now().timestamp())
                        delta_days = (now_ts - start_timestamp) // 86400
                        if delta_days <= 1: api_publish_time = PublishTimeType.ONE_DAY
                        elif delta_days <= 7: api_publish_time = PublishTimeType.ONE_WEEK
                        elif delta_days <= 180: api_publish_time = PublishTimeType.SIX_MONTH
                    
                    # 【核心策略】如果第一页结果太少，后续页码切换到 GENERAL 频道获取全量
                    search_channel = SearchChannelType.VIDEO if page == 1 else SearchChannelType.GENERAL
                    
                    post_sort_type = SearchSortType(config.SORT_TYPE) if hasattr(config, "SORT_TYPE") else SearchSortType.GENERAL
                    if start_timestamp > 0 and page == 1:
                        post_sort_type = SearchSortType.LATEST

                    posts_res = await self.dy_client.search_info_by_keyword(
                        keyword=keyword,
                        offset=(page - 1) * dy_limit_count,
                        search_channel=search_channel,
                        sort_type=post_sort_type,
                        publish_time=api_publish_time,
                        search_id=dy_search_id,
                    )
                    
                    # 优先获取 search_id 进行翻页会话维持
                    extra = posts_res.get("extra", {})
                    dy_search_id = extra.get("search_id") or extra.get("logid") or dy_search_id
                    has_more = posts_res.get("has_more") == 1 or posts_res.get("has_more") is True
                    
                    # 【优化】如果第一页 (VIDEO频道) 没数据或说没更多，强制尝试第二页 (GENERAL频道)
                    if page == 1 and not has_more:
                         utils.logger.info("⚠️ 第1页 (Video频道) 结束，强制尝试进入 第2页 (General频道)...")
                         has_more = True
                    checkpoint.metadata["dy_search_id"] = dy_search_id

                    data_list = posts_res.get("data", [])
                    total_raw = len(data_list)
                    
                    # 【核心调试】集成 Pro 版审计：打印第一页内容的原始快照包 (多级解析)
                    if data_list and page == start_page:
                        utils.logger.info("📦 [审计] 正在解析原始 API 数据包 (集成 Pro 版多级提取逻辑)...")
                        for i, item in enumerate(data_list[:5]):
                            raw = self.extractor.extract_aweme_info(item) or {}
                            r_id = raw.get("aweme_id", "N/A")
                            r_stats = self.extractor.get_item_statistics(raw)
                            r_time = utils.get_time_str_from_unix_time(raw.get("create_time", 0))
                            r_desc = raw.get("desc", "")[:20] + "..."
                            utils.logger.info(f"  #{i+1} ID:{r_id} | 赞:{r_stats['likes']} | 评:{r_stats['comments']} | 时间:{r_time} | 文案:{r_desc}")

                    # Handle Verification Case
                    if search_nil_info.get("search_nil_type") == "verify_check":
                        utils.logger.warning("🚨 [SearchHandler] 触发抖音安全验证 (verify_check)!")
                        
                        # 尝试自动/手动过验证 (Auto-solve or manual)
                        search_url = f"https://www.douyin.com/search/{keyword}?type=general"
                        utils.logger.info(f"🌐 正在跳转至验证页面尝试解锁: {search_url}")
                        
                        try:
                            # 1. Navigate to verification page
                            page = self.dy_client.playwright_page
                            await page.goto(search_url)
                            await asyncio.sleep(3)
                            
                            # 2. Attempt to solve slider
                            solved = await self.solve_captcha(page)
                            
                            if solved:
                                utils.logger.info("✅ 验证成功! 更新Cookie并重试...")
                                await self.dy_client.update_cookies(page.context)
                                await asyncio.sleep(2)
                                continue  # Retry current page
                            
                            # 3. If auto-solve failed, wait for manual intervention (if not extremely long timeout)
                            if not config.HEADLESS:
                                utils.logger.info("⏳ 自动验证失败，请在浏览器窗口手动完成验证 (等待 60 秒)...")
                                await asyncio.sleep(60)
                                await self.dy_client.update_cookies(page.context)
                                utils.logger.info("✅ 手动等待结束，正在重试...")
                                continue
                            else:
                                utils.logger.error("❌ 自动验证失败且处于无头模式，跳过此关键词")
                                # Mark as cooldown only if we really failed
                                await self.dy_client.update_account_status("cooldown")
                                break
                                
                        except Exception as e:
                            utils.logger.error(f"❌ 验证流程异常: {e}")
                            break


                    if not data_list:
                        empty_retry_count += 1
                        if empty_retry_count < 3 and has_more:
                            utils.logger.warning(f"⚠️ 第 {page} 页 API 返回为空，即将尝试跳页请求...")
                            page += 1
                            await asyncio.sleep(config.CRAWLER_TIME_SLEEP)
                            continue
                        else:
                            utils.logger.info(f"🏁 连续多页为空或搜衬到底，结束关键词 '{keyword}'")
                            break

                    # Reset empty retry if we found data
                    empty_retry_count = 0
                    
                    # Initialize skip counters
                    skip_stats = {"time": 0, "interaction": 0, "author": 0, "no_vid": 0, "duplicate": 0}
                    aweme_list_to_process = []
                    
                    for item in data_list:
                        # 【集成 Pro 版优点】支持常规视频、合集视频、图文等多级解析
                        aweme_info = self.extractor.extract_aweme_info(item)
                        
                        if not aweme_info or not aweme_info.get("aweme_id"): 
                            skip_stats["no_vid"] += 1
                            continue
                            
                        # 0. 数据库查重 (Pro 版特性)
                        aweme_id = aweme_info.get("aweme_id")
                        if await self.checkpoint_manager.is_note_processed(checkpoint.task_id, aweme_id):
                            skip_stats["duplicate"] += 1
                            continue

                        # --- 本地精准过滤逻辑 ---
                        # 使用我们在 config 预设好的时间戳和阈值
                        
                        # 1. 闭环时间窗口过滤 [start, end]
                        create_time = aweme_info.get("create_time", 0)
                        if (start_timestamp > 0 and create_time < start_timestamp) or \
                           (end_timestamp > 0 and create_time > end_timestamp):
                            skip_stats["time"] += 1
                            continue
                            
                        # 2. 互动范围过滤 (Interaction Range)
                        # 使用 Extractor 统一提取统计数据
                        stats = self.extractor.get_item_statistics(aweme_info)
                        likes = stats["likes"]
                        comments_count = stats["comments"]
                        shares = stats["shares"]
                        favorites = stats["favorites"]
                        
                        if (likes < config.MIN_LIKES_COUNT or 
                            comments_count < config.MIN_COMMENTS_COUNT or 
                            shares < config.MIN_SHARES_COUNT or 
                            favorites < config.MIN_FAVORITES_COUNT or
                            (config.MAX_LIKES_COUNT > 0 and likes > config.MAX_LIKES_COUNT) or
                            (config.MAX_COMMENTS_COUNT > 0 and comments_count > config.MAX_COMMENTS_COUNT) or
                            (config.MAX_SHARES_COUNT > 0 and shares > config.MAX_SHARES_COUNT) or
                            (config.MAX_FAVORITES_COUNT > 0 and favorites > config.MAX_FAVORITES_COUNT)):
                            skip_stats["interaction"] += 1
                            continue

                        # 3. 博主去重
                        user_id = aweme_info.get("author", {}).get("uid")
                        if config.DEDUPLICATE_AUTHORS and user_id in processed_authors:
                            skip_stats["author"] += 1
                            continue
                            
                        # 4. 舆情敏感词本地过滤 (Sentiment local filter)
                        # 如果设置了舆情词，则本地强制校验（即便搜索召回了，也要确保文案匹配）
                        if sentiment_keywords:
                            content_text = f"{aweme_info.get('desc', '')} {aweme_info.get('title', '')}".lower()
                            if not any(skw.lower() in content_text for skw in sentiment_keywords):
                                skip_stats["sentiment"] = skip_stats.get("sentiment", 0) + 1
                                continue
                        
                        # 全部通过过滤
                        aweme_list_to_process.append(aweme_info)
                        if user_id: processed_authors.add(user_id)
                        
                        if total_processed_count + len(aweme_list_to_process) >= config.CRAWLER_MAX_NOTES_COUNT:
                            break

                    # 汇总打印过滤结果 (Print aggregated skip summary)
                    total_out = len(aweme_list_to_process)
                    utils.logger.info(f"📊 第 {page} 页汇总: API返回 {total_raw} 条 | 达标 {total_out} 条")
                    if total_out == 0 and total_raw > 0:
                        utils.logger.warning(f"  └─ 剔除原因: 时间 {skip_stats['time']} | 互动 {skip_stats['interaction']} | 重复博主 {skip_stats['author']} | 舆情不符 {skip_stats.get('sentiment', 0)}")
                    elif total_raw > 0:
                        utils.logger.info(f"  └─ 过滤详情: 已存在 {skip_stats['duplicate']} | 时间 {skip_stats['time']} | 互动 {skip_stats['interaction']} | 舆情 {skip_stats.get('sentiment', 0)}")

                    if aweme_list_to_process:
                        await self.aweme_processor.process_aweme_list(aweme_list=aweme_list_to_process, checkpoint=checkpoint)
                        if config.ENABLE_GET_COMMENTS:
                            valid_ids = [a.get("aweme_id") for a in aweme_list_to_process]
                            await self.comment_processor.batch_get_aweme_comments(valid_ids, checkpoint=checkpoint)
                        total_processed_count += len(aweme_list_to_process)

                    # 更新进度
                    checkpoint.update_progress(page=page + 1)
                    await self.checkpoint_manager.save(checkpoint)
                    page += 1
                    
                    if total_processed_count >= config.CRAWLER_MAX_NOTES_COUNT:
                        utils.logger.info(f"🎯 任务指标达成！已收齐 {total_processed_count} 条合格数据")
                        break
                    
                    if not has_more:
                        utils.logger.info(f"🏁 搜索池已干涸，无法获取更多结果")
                        break
                        
                    # Random sleep between pages
                    await utils.random_sleep(base_seconds=config.CRAWLER_TIME_SLEEP)

                except DataFetchError as e:
                    utils.logger.error(f"[SearchHandler] fetch error: {e}")
                    break
                except Exception as e:
                    utils.logger.error(f"[SearchHandler] unexpected error: {e}")
                    break
            
            # Keyword finished
            checkpoint.mark_completed()
            await self.checkpoint_manager.save(checkpoint)
            
            if total_processed_count >= config.CRAWLER_MAX_NOTES_COUNT:
                break
        
            # Keyword finished
            checkpoint.mark_completed()
            await self.checkpoint_manager.save(checkpoint)
            
            if total_processed_count >= config.CRAWLER_MAX_NOTES_COUNT:
                break
        
        utils.logger.info(f"🏁 [SearchHandler] 任务全部完成，共计抓取符合条件的数据: {total_processed_count} 条")

    async def solve_captcha(self, page) -> bool:
        """
        Attempt to identify and solve slider captcha using CV
        """
        back_selector = "#captcha-verify-image"
        gap_selector = 'xpath=//*[@id="captcha_container"]/div/div[2]/img[2]'
        
        try:
            # Check if slider exists
            try:
                await page.wait_for_selector(back_selector, state="visible", timeout=5000)
            except PlaywrightTimeoutError:
                utils.logger.warning("⚠️ 未检测到滑块元素，可能是已被自动跳过或其他验证类型")
                # Reload to double check or return False
                return False

            utils.logger.info("🧩 检测到滑块，开始图像识别与滑动...")
            
            # Retry mechanism
            for attempt in range(3):
                # 1. Get images
                slider_back = await page.wait_for_selector(back_selector, timeout=3000)
                slide_back_url = await slider_back.get_attribute("src")
                
                slider_gap = await page.wait_for_selector(gap_selector, timeout=3000)
                slide_gap_url = await slider_gap.get_attribute("src")
                
                if not slide_back_url or not slide_gap_url:
                    utils.logger.warning("⚠️ 无法获取验证码图片URL")
                    return False

                # 2. Discern distance
                slide_app = utils.Slide(gap=slide_gap_url, bg=slide_back_url)
                distance = slide_app.discern()
                utils.logger.info(f"📏 [Attempt {attempt+1}] 识别滑动距离: {distance}")
                
                # 3. Generate tracks
                tracks = utils.get_tracks(distance, level="easy")
                
                # 4. Perform mouse action
                element = await page.query_selector(gap_selector)
                box = await element.bounding_box()
                if not box: return False
                
                # Center + jitter
                start_x = box["x"] + box["width"] / 2
                start_y = box["y"] + box["height"] / 2
                
                await page.mouse.move(start_x, start_y)
                await element.hover()
                await page.mouse.down()
                
                current_x = start_x
                for track in tracks:
                    await page.mouse.move(current_x + track, start_y + random.uniform(-2, 2), steps=random.randint(1, 3))
                    current_x += track
                
                await asyncio.sleep(0.5)
                await page.mouse.up()
                await asyncio.sleep(2)
                
                # 5. Check result
                try:
                    # If "operate too slow" or "refresh" appears
                    content = await page.content()
                    if "操作过慢" in content or "提示重新操作" in content:
                        utils.logger.info("⚠️ 操作过慢，刷新验证码...")
                        refresh_btn = await page.query_selector(".secsdk_captcha_refresh")
                        if refresh_btn: await refresh_btn.click()
                        await asyncio.sleep(2)
                        continue
                        
                    # Wait for slider to disappear
                    await page.wait_for_selector(back_selector, state="hidden", timeout=3000)
                    utils.logger.info("✅ 滑块验证通过 (元素消失)")
                    return True
                except:
                    utils.logger.info("❌ 单词滑动未成功，重试中...")
                    
            return False
            
        except Exception as e:
            utils.logger.error(f"❌ 自动滑块流程出错: {e}")
            return False
