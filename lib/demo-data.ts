import { CommentRecord, ModerationSettingsRecord, PostRecord } from '@/lib/types';

const now = Date.now();

export const demoModerationSettings: ModerationSettingsRecord & { announcement: string } = {
  announcement:
    '先审后发 · 请避免人身攻击、隐私曝光和恶意带节奏。校园墙是匿名表达的地方，不是网暴工具。',
  blocked_keywords: ['辱骂', '开盒', '联系方式', '地址', '电话', '引流', '加群', '代写', '刷单', '赌', '诈骗'],
  blocked_aliases: [],
  blocked_ips: []
};

export const demoPosts: PostRecord[] = [
  {
    id: 'demo-1',
    status: 'published',
    category: '表白',
    author_name: '匿名同学',
    alias: '匿名同学',
    content: '图书馆三层靠窗的位置，有人每晚都会留下两杯热饮。我想知道你是谁，也想把这份温柔认真接住。',
    image_url: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1200&q=80',
    moderation_reason: null,
    like_count: 126,
    comment_count: 14,
    created_at: new Date(now - 1000 * 60 * 60 * 28).toISOString(),
    published_at: new Date(now - 1000 * 60 * 60 * 27).toISOString(),
    ip_address: null
  },
  {
    id: 'demo-2',
    status: 'published',
    category: '失物招领',
    author_name: '匿名同学',
    alias: '匿名同学',
    content: '今天下午 4 点左右在北门食堂捡到一张校园卡，姓名首字母是 Y. M.，已经交到一楼服务台。',
    image_url: null,
    moderation_reason: null,
    like_count: 61,
    comment_count: 8,
    created_at: new Date(now - 1000 * 60 * 60 * 18).toISOString(),
    published_at: new Date(now - 1000 * 60 * 60 * 18).toISOString(),
    ip_address: null
  },
  {
    id: 'demo-3',
    status: 'published',
    category: '日常吐槽',
    author_name: '匿名同学',
    alias: '匿名同学',
    content: '今天的晚自习像被拉成了慢速胶片，手机没电、作业没写完、风还很冷，但操场那边的灯很好看。',
    image_url: 'https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&w=1200&q=80',
    moderation_reason: null,
    like_count: 203,
    comment_count: 32,
    created_at: new Date(now - 1000 * 60 * 60 * 12).toISOString(),
    published_at: new Date(now - 1000 * 60 * 60 * 12).toISOString(),
    ip_address: null
  },
  {
    id: 'demo-4',
    status: 'published',
    category: '万能墙',
    author_name: '匿名同学',
    alias: '匿名同学',
    content: '求一个能把高数从“听懂了”变成“会做了”的方法。明天考试，只差一道题的救命光。',
    image_url: null,
    moderation_reason: null,
    like_count: 94,
    comment_count: 21,
    created_at: new Date(now - 1000 * 60 * 60 * 6).toISOString(),
    published_at: new Date(now - 1000 * 60 * 60 * 6).toISOString(),
    ip_address: null
  }
];

export const demoComments: CommentRecord[] = [
  {
    id: 'demo-comment-1',
    post_id: 'demo-1',
    author_name: '匿名同学',
    content: '这段话太有画面感了，像一封没寄出去的信。',
    created_at: new Date(now - 1000 * 60 * 50).toISOString()
  },
  {
    id: 'demo-comment-2',
    post_id: 'demo-1',
    author_name: '匿名同学',
    content: '如果是我，我会希望你真的去接住那份好意。',
    created_at: new Date(now - 1000 * 60 * 20).toISOString()
  }
];
