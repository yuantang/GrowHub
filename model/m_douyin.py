# -*- coding: utf-8 -*-

from pydantic import BaseModel, Field


class VideoUrlInfo(BaseModel):
    """Douyin video URL information"""
    aweme_id: str = Field(title="aweme id (video id)")
    url_type: str = Field(default="normal", title="url type: normal, short, modal")


class CreatorUrlInfo(BaseModel):
    """Douyin creator URL information"""
    sec_user_id: str = Field(title="sec_user_id (creator id)")


class DouyinAweme(BaseModel):
    """
    抖音视频
    """
    aweme_id: str = Field(default="", description="视频ID")
    aweme_type: str = Field(default="", description="视频类型")
    title: str = Field(default="", description="视频标题")
    desc: str = Field(default="", description="视频描述")
    create_time: str = Field(default="", description="视频发布时间戳")
    liked_count: str = Field(default="", description="视频点赞数")
    comment_count: str = Field(default="", description="视频评论数")
    share_count: str = Field(default="", description="视频分享数")
    collected_count: str = Field(default="", description="视频收藏数")
    aweme_url: str = Field(default="", description="视频详情页URL")
    cover_url: str = Field(default="", description="视频封面图URL")
    video_download_url: str = Field(default="", description="视频下载地址")
    source_keyword: str = Field(default="", description="搜索来源关键字")
    is_ai_generated: int = Field(default=0, description="作者是否声明视频为AI生成")

    user_id: str = Field(default="", description="用户ID")
    sec_uid: str = Field(default="", description="用户sec_uid")
    short_user_id: str = Field(default="", description="用户短ID")
    user_unique_id: str = Field(default="", description="用户唯一ID")
    nickname: str = Field(default="", description="用户昵称")
    avatar: str = Field(default="", description="用户头像地址")
    user_signature: str = Field(default="", description="用户签名")
    ip_location: str = Field(default="", description="IP地址")


class DouyinAwemeComment(BaseModel):
    """
    抖音视频评论
    """
    comment_id: str = Field(default="", description="评论ID")
    aweme_id: str = Field(default="", description="视频ID")
    content: str = Field(default="", description="评论内容")
    create_time: str = Field(default="", description="评论时间戳")
    sub_comment_count: str = Field(default="", description="评论回复数")
    parent_comment_id: str = Field(default="", description="父评论ID")
    reply_to_reply_id: str = Field(default="", description="目标评论ID")
    like_count: str = Field(default="", description="点赞数")
    pictures: str = Field(default="", description="评论图片列表")
    ip_location: str = Field(default="", description="评论时的IP地址")

    user_id: str = Field(default="", description="用户ID")
    sec_uid: str = Field(default="", description="用户sec_uid")
    short_user_id: str = Field(default="", description="用户短ID")
    user_unique_id: str = Field(default="", description="用户唯一ID")
    nickname: str = Field(default="", description="用户昵称")
    avatar: str = Field(default="", description="用户头像地址")
    user_signature: str = Field(default="", description="用户签名")


class DouyinCreator(BaseModel):
    """
    抖音创作者
    """
    user_id: str = Field(default="", description="用户ID")
    nickname: str = Field(default="", description="用户昵称")
    avatar: str = Field(default="", description="用户头像地址")
    ip_location: str = Field(default="", description="IP地址")
    desc: str = Field(default="", description="用户描述")
    gender: str = Field(default="", description="性别")
    follows: str = Field(default="", description="关注数")
    fans: str = Field(default="", description="粉丝数")
    interaction: str = Field(default="", description="获赞数")
    videos_count: str = Field(default="", description="作品数")
