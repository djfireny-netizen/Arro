import { AsyncLocalStorage } from 'node:async_hooks';
const telemetry=new AsyncLocalStorage();
export const withTelemetry=(sink,task)=>telemetry.run(sink,task);
import { revisionContext, replacementEvents } from './core/revision.mjs';
// Arro model integration: providers, prompts, and arrangement generation.
// Changes are reloaded on the next request; a service restart is unnecessary.

import { measure, flags, fmt, playedBars } from './eval/metrics.mjs';
import { planIssues } from './song-contract.mjs';
import { readFileSync } from 'node:fs';
import { completionFetch } from './model-transport.mjs';

// Switchable model providers using OpenAI-compatible APIs.
const PROVIDERS = {
  aihubmix: { label: 'Claude', baseURL: (process.env.AIHUBMIX_BASE_URL || 'https://aihubmix.com/v1').replace(/\/$/, ''), keyEnv: 'AIHUBMIX_API_KEY', model: process.env.AIHUBMIX_MODEL || 'claude-opus-5-5', json: false },
  qwen:     { label: '千问',     baseURL: process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1', keyEnv: 'DASHSCOPE_API_KEY', model: process.env.QWEN_MODEL || 'qwen-plus', json: true },
  deepseek: { label: 'DeepSeek', baseURL: 'https://api.deepseek.com/v1',                       keyEnv: 'DEEPSEEK_API_KEY',  model: process.env.DEEPSEEK_MODEL || 'deepseek-chat', json: true },
  doubao:   { label: '豆包',     baseURL: 'https://ark.cn-beijing.volces.com/api/v3',          keyEnv: 'ARK_API_KEY',       model: process.env.DOUBAO_MODEL || '', json: false },
  mock:     { label: '演示模型', baseURL: '', keyEnv: '', model: 'mock', json: true }
};
export const PROVIDER = (process.env.PROVIDER || 'qwen').toLowerCase();
export const P = PROVIDERS[PROVIDER] || PROVIDERS.qwen;
export const KEY = P.keyEnv ? process.env[P.keyEnv] : 'mock';
const ENGLISH = (process.env.PROMPT_LANGUAGE || (PROVIDER === 'aihubmix' ? 'en' : 'zh')) === 'en';
const EN_SONG = readFileSync(new URL('./prompts/song.en.txt', import.meta.url), 'utf8');
const EN_CRITIC = readFileSync(new URL('./prompts/critic.en.txt', import.meta.url), 'utf8');

const SYSTEM = `你是一位一线流行音乐制作人兼编曲老师，帮新手把"一个画面或心情"变成一段 4 小节、4/4 拍、可以循环的副歌编曲。它会被自动展开成整首歌，所以这 4 小节要有做成热门单曲的潜质：一听就有记忆点，但不俗套、不口水，编曲要有当下的审美。
只输出一个 JSON 对象，不要任何解释文字，不要代码块标记。

字段要求：
- title：给这段音乐起的中文短名字（2-8 个字）
- style：从下面 22 种里选最贴合画面的一个，填英文键名：
  流行：ballad 流行抒情，citypop City Pop，folk 民谣，dancepop 舞曲流行，rnb R&B
  电子：synthwave 合成器浪潮，house House 舞曲，futurebass Future Bass，dnb Drum & Bass，chiptune 8-bit 游戏，ambient 氛围，lofi Lo-fi
  节奏：trap Trap 说唱，funk 放克，reggae 雷鬼，afrobeats 非洲节拍，bossa 波萨诺瓦
  器乐：jazz 爵士，blues 蓝调，rock 摇滚，guofeng 国风，cinematic 电影配乐
- key：C C# D Eb E F F# G Ab A Bb B 之一；mode：major 或 minor
- bpm：60-180 的整数，要符合风格（ballad 66-82，citypop 98-114，folk 78-100，dancepop 116-128，rnb 66-84，synthwave 96-114，house 118-126，futurebass 140-160，dnb 168-176，chiptune 132-160，ambient 60-76，lofi 70-88，trap 132-150，funk 98-114，reggae 68-86，afrobeats 100-116，bossa 120-140，jazz 100-132，blues 66-90，rock 112-140，guofeng 72-92，cinematic 70-92）
- progression：恰好 4 项，每小节一个和弦。degree 是调内级数 1-7（1 = 主和弦），seventh 表示是否加七音（lofi、citypop、house 建议加）
- drums：一小节的鼓点，会自动循环 4 次。kick snare clap hat openhat 各是恰好 16 个字符的字符串，每个字符是一个十六分音符：x = 重击，o = 轻击，. = 不打。name 是中文名字
- bass：一小节的贝斯节奏，会自动跟随每小节的和弦。notes 里每项 {step: 0-15, len: 1-16, tone: "root" | "fifth" | "octave"}，音符不要超过小节末尾
- chords：一小节的和弦节奏。hits 里每项 {step: 0-15, len: 1-16}；想要分解和弦时加 arp: 0-3，表示只弹和弦的第几个音
- melody：你亲自写的 4 小节副歌旋律（这是最重要的部分，程序会拿它和规则引擎写的版本比较，择优使用）。
  notes 里每项 {step: 0-63（4 小节共 64 个十六分音符）, len: 1-16, degree: 调内级数（1 = 主音，2-7 往上，8 = 高八度的主音，0 和负数表示主音下方）, acc: 可选，1 = 升半音，-1 = 降半音}
  写法要求：12-28 个音；音域不超过一个八度加三度；先写一个 1-2 拍的短动机，后面要重复它但每次有变化（移高、换结尾、节奏微调），不要四个小节各唱各的；
  第 2 小节末尾和第 4 小节末尾留出换气；强拍多落在当小节和弦的和弦音上；最后一个音落在 1、3 或 5 级上。
  why 用一句话说明这段旋律的记忆点在哪里
- hook：给规则引擎的提示（它会按这个再写几版和你的比较）：
  rhythm 是动机节奏，只能是 c332（三三二切分，律动感最强）| dot（附点，往前迈步）| run（四个平均八分，像说话）| rep（同音重复，最简单好记）| off（后半拍进，有弹性）| long（一长两短，抒情）之一；
  contour 是动机走向，只能是 repeat（在一个音上打转）| arch（先上后下）| fall（往下走，叹气感）| leap（先大跳再走回来，最有冲击力）之一；
  form 是句子结构，只能是 ABAC（问答）| AABA | SEQ（模进，一级级往上）| CALL（高低呼应）| LINE（两小节长句）| RAP（节奏短句）之一；
  why 用一句话说明为什么这个动机适合这个画面
- explain：2-3 句中文大白话，告诉新手这个和弦走向和节奏为什么适合这个画面。不要提具体歌名或歌手

呼吸感：
- 贝斯不要每个位置都弹，留一些空，和底鼓错开
- 鼓点要有轻有重，不要每个位置都打满

编曲标准（很重要）：
- 记忆点来自"简单的动机 + 意外的一点"：动机要短、好记，和弦或节奏里放一个不那么常见的选择（挂留和弦、借用和弦、切分、晚半拍进），而不是堆复杂
- 避开口水套路：不要把 1-5-6-4、6-4-1-5、1-6-4-5 原样用满四小节；想用时至少换掉一个和弦（比如 5 换成挂四、4 换成 2 级七和弦）
- 鼓和贝斯要有当下的律动：留白、切分、和底鼓错开，不要所有位置平均地打满
- 如果画面后面带有"｜要求："，必须按要求调整（偏暗就用小调，偏亮就用大调；能量低就少打几下，能量高就更满；和声丰富就多用七和弦）

让每次都不一样：
- 不要默认使用 1-6-4-5、1-5-6-4 这类最常见的进行，先想想这个画面有什么特别的情绪，再选和弦
- 踩镲、底鼓要按风格和画面设计，不要每次都写 x.o.x.o.x.o.x.o.
- 和弦的 hits 之间不要重叠：前一个的 step + len 不能超过下一个的 step

输出格式示例（示例里的内容都是随手写的，只用来说明字段怎么写）：
{"title":"名字","style":"synthwave","key":"A","mode":"minor","bpm":104,
"progression":[{"degree":1,"seventh":false},{"degree":2,"seventh":false},{"degree":3,"seventh":false},{"degree":4,"seventh":false}],
"drums":{"name":"鼓点名字","kick":"x...............","snare":"................","clap":"................","hat":"................","openhat":"................"},
"bass":{"name":"贝斯名字","notes":[{"step":0,"len":4,"tone":"root"}]},
"chords":{"name":"和弦名字","hits":[{"step":0,"len":8}]},
"melody":{"name":"旋律名字","why":"一句话","notes":[{"step":0,"len":3,"degree":5},{"step":3,"len":3,"degree":6},{"step":6,"len":2,"degree":5,"acc":0}]},
"hook":{"rhythm":"c332","contour":"arch","form":"AABA","why":"一句话理由"},
"explain":"两三句话。"}`;

// Offline demo data for PROVIDER=mock.
const MOCK = {"title":"午夜环线","style":"synthwave","key":"A","mode":"minor","bpm":104,
"progression":[{"degree":1,"seventh":false},{"degree":6,"seventh":false},{"degree":3,"seventh":false},{"degree":7,"seventh":false}],
"drums":{"name":"复古直拍","kick":"x.......x.......","snare":"....x.......x...","clap":"................","hat":"x.x.x.x.x.x.x.x.","openhat":"................"},
"bass":{"name":"八分脉冲","notes":[{"step":0,"len":2,"tone":"root"},{"step":2,"len":2,"tone":"root"},{"step":4,"len":2,"tone":"root"},{"step":6,"len":2,"tone":"octave"},{"step":8,"len":2,"tone":"root"},{"step":10,"len":2,"tone":"root"},{"step":12,"len":2,"tone":"fifth"},{"step":14,"len":2,"tone":"octave"}]},
"chords":{"name":"长音铺底","hits":[{"step":0,"len":16}]},
"melody":{"name":"夜行动机","notes":[{"step":0,"len":4,"degree":5},{"step":4,"len":2,"degree":4},{"step":6,"len":2,"degree":3},{"step":8,"len":8,"degree":1},{"step":18,"len":2,"degree":3},{"step":20,"len":4,"degree":6},{"step":24,"len":8,"degree":5},{"step":32,"len":4,"degree":5},{"step":36,"len":2,"degree":4},{"step":38,"len":2,"degree":3},{"step":40,"len":8,"degree":3},{"step":50,"len":2,"degree":2},{"step":52,"len":4,"degree":2},{"step":56,"len":8,"degree":1}]},
"hook":{"rhythm":"c332","contour":"arch","form":"LINE","why":"三三二切分配上先上后下的弧线，像车窗外一盏盏掠过的路灯。"},
"explain":"i–VI–III–VII 从小调出发，借几个大三和弦慢慢往上走，暗里透着光，像夜里路灯一盏盏掠过。八分音符的贝斯一直往前推，就是开车的速度感。"};

// Choose a creative direction at random to vary generated arrangements.
const FEELS = ['贝斯多用休止，和底鼓一问一答','鼓点尽量简单，把空间留给和弦','鼓点加一些十六分音符的轻击，律动更细','和弦少用最常见的套路，找一个更有性格的走向','和弦节奏用切分，提前半拍进','贝斯用八度跳跃让律动更活泼'];



/* ============ Full songs: the model acts as producer ============ */
const STYLE_LIST = `  流行：ballad 流行抒情，citypop City Pop，folk 民谣，dancepop 舞曲流行，rnb R&B
  电子：synthwave 合成器浪潮，house House 舞曲，futurebass Future Bass，dnb Drum & Bass，chiptune 8-bit 游戏，ambient 氛围，lofi Lo-fi
  节奏：trap Trap 说唱，funk 放克，reggae 雷鬼，afrobeats 非洲节拍，bossa 波萨诺瓦
  器乐：jazz 爵士，blues 蓝调，rock 摇滚，guofeng 国风，cinematic 电影配乐
  bpm 参考：ballad 66-82，citypop 98-114，folk 78-100，dancepop 116-128，rnb 66-84，synthwave 96-114，house 118-126，futurebass 140-160，dnb 168-176，chiptune 132-160，ambient 60-76，lofi 70-88，trap 132-150，funk 98-114，reggae 68-86，afrobeats 100-116，bossa 120-140，jazz 100-132，blues 66-90，rock 112-140，guofeng 72-92，cinematic 70-92`;

const SONG_SYSTEM = `你是一位世界级的流行音乐制作人兼编曲人。用户给你一个画面或心情，你为它写一首完整歌曲的编曲方案（不含歌词），程序会照着演奏并导出 MIDI 给编曲人继续制作。
目标：有做成热门单曲的潜质，一听就有记忆点；同时要有只属于这首歌的想法，不俗套、不口水，编曲有当下的审美。像真正的制作人那样，根据这首歌的情绪和画面做每一个决定，而不是套固定格式。

只输出一个 JSON 对象，不要任何解释文字，不要代码块标记。

【全局】
- title：中文歌名（2-8 字）
- concept：一两句话，这首歌的核心构思，以及它最特别的一个想法
- style：从下面 22 种里选一个，填英文键名
${STYLE_LIST}
- key：C C# D Eb E F F# G Ab A Bb B 之一；mode：major 或 minor；bpm：整数
- 时长：整首控制在 2 分 40 秒到 3 分 30 秒。每小节秒数 = 240 ÷ bpm，请据此决定总小节数。

【harmony：和声】对象。键是你起的名字（如 "chorus"、"verse"、"pre"、"bridge"），值是 4 个或 8 个和弦的数组，每个和弦占一小节。
和弦写法：级数 1-7（按当前调式：大调 1=I；小调 1=i、3=III、6=VI、7=VII，小调的 3、6、7 本身就是降的，不用再加 b），前面可加 b 或 # 表示把根音降/升半音（如 "b7"、"b6"），后面可加性质：m、maj7、m7、7、9、sus4、sus2、dim、add9、m9、maj9、6、m6（不写就用调内默认三和弦）。
例："1"、"6m7"、"4maj7"、"5sus4"、"b7"、"2m7"、"4m"（大调里借来的小四级）。

【grooves：律动】对象。键是名字（如 "A"、"B"、"half"），每个律动描述一小节，在段落里循环：
- drums：{kick, snare, clap, hat, openhat}，各是恰好 16 个字符，每个字符一个十六分音符：x 重击，o 轻击，. 不打
- bass：字符串，"步:长:音" 用空格分隔。步 0-15，长 1-16，音 R=根音 5=五音 O=高八度 3=三音。例 "0:6:R 6:2:5 8:8:R"。音高会自动跟随每小节的和弦
- chords：字符串，和弦的节奏，"步:长" 用空格分隔。例 "0:3 3:3 8:8"
律动之间要有真正的区别（比如主歌松、副歌满、桥段换一种感觉），鼓点和贝斯要有这首歌自己的律动性格。

【melodies：旋律】对象。键是名字（如 "chorus"、"verse"、"pre"、"bridge"），值是音符串："步:长:级数"，空格分隔。
步从 0 开始，一小节 16 步，4 小节是 0-63，8 小节是 0-127；长 1-16；级数 1-7 是调内音，8-14 是高八度，0 和负数在主音下方；级数后可加 # 或 b 表示升降半音（例 "4#"）。
- 副歌：全曲音区最高、最抓耳；一个短动机加上有变化的重复；8 小节时前半句停在不稳定的音、后半句落回稳定的音
- 主歌：音区更低、更像说话，给歌词留空间，节奏型和副歌明显不同；8 小节的主歌前后两句不要一模一样
- 预副歌（如果有）：往上推，积累张力
- 桥段、记忆点段（如果需要旋律）：新的材料，和前面形成对比
- 每两小节左右留换气；强拍多落在当小节的和弦音上；每条旋律的音域控制在一个八度加三度以内

【sections：段落】数组，按播放顺序。每段：
{"type": intro|verse|pre|chorus|post|bridge|outro, "bars": 4 或 8, "harmony": 用哪组和声, "groove": 用哪个律动, "play": 出场的乐器数组（从 drums bass chords melody arp pad perc 里选）, "melody": 用哪条旋律或 "none", "energy": 0-1, "moves": 制作手法数组（可为空）, "idea": 一句话说明这一段怎么处理、为什么}
可用的制作手法（按需选择，不要每段都堆）：
- fill：段尾鼓过门
- stop：段尾最后一拍全体停下（旋律除外），下一段砸进来
- full_stop：段尾最后两拍连旋律一起停
- build：段尾军鼓越打越密往上推
- drop_first_bar：这一段第一小节先不进鼓和贝斯
- half_time：这一段鼓改成半速
- double_octave：旋律叠一个高八度
- harmony_vocal：旋律加一条三度和声
- counter_line：铺底换成一条对位旋律
- filter_sweep：整体声音从闷到亮慢慢打开
- key_up：从这一段开始整体升一个全音（通常给最后一遍副歌，全曲最多一次）
post 是副歌后的"记忆点段"（后副歌）。

【结构和创意】
不要默认"前奏-主歌-预副歌-副歌"的固定套路，按这首歌需要决定：可以副歌开场、可以没有预副歌、可以有记忆点段、两段主歌可以处理得不同、可以在意想不到的地方留白。
整首的能量要有起伏和推进；至少有一处让人意外、但放在这首歌里又合理的处理，并在 idea 里写清楚。

输出格式示例（内容随手写的，只说明字段怎么写）：
{"title":"名字","concept":"一两句话","style":"synthwave","key":"A","mode":"minor","bpm":104,
"harmony":{"chorus":["1","6","3","7","1","6","4","5"],"verse":["1","b7","6","5"]},
"grooves":{"A":{"drums":{"kick":"x.......x.......","snare":"....x.......x...","clap":"................","hat":"x.x.x.x.x.x.x.x.","openhat":"................"},"bass":"0:2:R 2:2:R 4:2:O 6:2:R","chords":"0:16"}},
"melodies":{"chorus":"0:3:5 3:3:6 6:2:5 8:8:3","verse":"0:2:1 2:2:2 4:4:3"},
"sections":[{"type":"intro","bars":4,"harmony":"chorus","groove":"A","play":["pad","arp"],"melody":"none","energy":0.2,"moves":["filter_sweep"],"idea":"一句话"}]}`;

const CRITIC_SYSTEM = `你是一位以挑剔著称的资深 A&R 兼制作人。下面是一首歌的编曲方案初稿（JSON，字段含义见最后）。
请先在心里逐项审查：
1. 副歌钩子够不够抓耳，能不能听一遍就记住；
2. 主歌和副歌的反差（音区、节奏、能量）是否足够；
3. 整首的能量曲线和结构是否拖沓、平淡或过于套路；
4. 和声是否落入口水套路，各段和声有没有区别；
5. 有没有一个只属于这首歌的想法；
6. 旋律是否好唱、有没有换气，强拍是否落在和弦音上；
7. 时长是否在 2 分 40 秒到 3 分 30 秒。初稿后面附有程序测量的数据（时长、小节数、各段和弦数、旋律音域等），这些数字是准确的，以它为准，不要自己心算时长；改动小节数或 bpm 时，按"每小节秒数 = 240 ÷ bpm"重新核对。
段落的 bars 只能是 4 或 8。
然后直接输出修改后的完整方案 JSON（格式与初稿完全相同，所有字段都要有），再加一个 review 字段：3-5 条中文短句的数组，每条说明改了哪里、为什么。review 只写最终方案里真实做了的改动，里面提到的数字（小节数、时长、bpm）必须和最终方案一致。
改动要大胆但有理由，保留初稿里真正好的部分。只输出 JSON，不要代码块标记。

字段说明：harmony 的和弦写法是级数 1-7（可加 b/# 前缀和 m、maj7、m7、7、9、sus4、sus2、dim、add9、m9、maj9、6、m6 后缀）；grooves 里 drums 是 16 个字符的鼓点，bass 是 "步:长:音(R/5/O/3)"，chords 是 "步:长"；melodies 是 "步:长:级数" 的音符串（一小节 16 步，级数可加 #/b）；sections 的 moves 只能从 fill stop full_stop build drop_first_bar half_time double_octave harmony_vocal counter_line filter_sweep key_up 里选。`;

// Offline full-song demo data for PROVIDER=mock.
const MOCK_SONG = {"title":"午夜环线","concept":"一个人夜里开车绕城：主歌只有贝斯和鼓像引擎声，副歌突然打开成一片霓虹；最特别的是第二遍副歌前全体停两拍，像车开进隧道。","style":"synthwave","key":"A","mode":"minor","bpm":104,
"harmony":{"chorus":["1","6","3","7","1","6","4","5sus4"],"verse":["1","b7","6","7","1","b7","4m","5"],"pre":["4","5","6","5"],"bridge":["6maj7","7","3","5"]},
"grooves":{"A":{"drums":{"kick":"x.......x.x.....","snare":"....x.......x...","clap":"................","hat":"x.x.x.x.x.x.x.x.","openhat":"..............x."},"bass":"0:2:R 2:2:R 4:2:O 6:2:R 8:2:R 10:2:R 12:2:O 14:2:5","chords":"0:16"},
 "V":{"drums":{"kick":"x.........x.....","snare":"....o.......x...","clap":"................","hat":"o.o.o.o.o.o.o.o.","openhat":"................"},"bass":"0:6:R 6:2:R 10:4:5 14:2:O","chords":"0:3 3:5 8:8"},
 "H":{"drums":{"kick":"x...............","snare":"........x.......","clap":"................","hat":"x...x...x...x...","openhat":"................"},"bass":"0:12:R 12:4:5","chords":"0:16"}},
"melodies":{"chorus":"0:3:5 3:3:6 6:2:5 8:4:3 12:4:5 16:3:5 19:3:6 22:2:8 24:8:7 32:3:5 35:3:6 38:2:5 40:4:3 44:4:2 48:3:3 51:3:2 54:2:1 56:8:1 64:3:5 67:3:6 70:2:5 72:4:3 76:4:5 80:3:5 83:3:6 86:2:9 88:8:8 96:3:6 99:3:5 102:2:3 104:4:2 108:4:3 112:4:2 116:4:7 120:8:1",
 "verse":"2:2:1 4:2:1 6:4:3 12:2:2 14:2:1 16:4:7 20:4:1 34:2:1 36:2:3 38:4:4 44:2:3 46:2:1 48:8:2 66:2:3 68:2:3 70:4:5 76:2:4 78:2:3 80:4:2 84:4:1 98:2:1 100:2:3 102:4:4 108:2:3 110:2:2 112:4:1 116:4:7 120:8:1",
 "pre":"0:4:3 4:4:4 8:4:5 12:4:6 16:4:5 20:4:6 24:4:7 28:4:8 32:6:9 38:2:8 40:8:7 48:8:5",
 "post":"0:2:8 2:2:8 4:2:7 6:2:5 8:2:8 10:2:8 12:4:7 16:2:8 18:2:8 20:2:7 22:2:5 24:8:6 32:2:8 34:2:8 36:2:7 38:2:5 40:2:8 42:2:8 44:4:9 48:4:8 52:4:7 56:8:8"},
"sections":[
 {"type":"intro","bars":8,"harmony":"chorus","groove":"H","play":["pad","arp","bass"],"melody":"none","energy":0.25,"moves":["filter_sweep"],"idea":"城市在远处慢慢亮起来：只有铺底和琶音，声音从闷到亮打开。"},
 {"type":"verse","bars":8,"harmony":"verse","groove":"V","play":["drums","bass","chords","melody"],"melody":"verse","energy":0.4,"moves":["fill"],"idea":"贝斯和鼓像引擎声，和弦只轻轻点几下，给人声留空间。"},
 {"type":"pre","bars":4,"harmony":"pre","groove":"V","play":["drums","bass","chords","melody","pad"],"melody":"pre","energy":0.6,"moves":["build","stop"],"idea":"旋律一级级往上爬，最后一拍全体停下，副歌砸进来。"},
 {"type":"chorus","bars":8,"harmony":"chorus","groove":"A","play":["drums","bass","chords","melody","arp","pad","perc"],"melody":"chorus","energy":0.85,"moves":["double_octave","fill"],"idea":"霓虹一下子全亮：八分贝斯推着走，旋律叠高八度。"},
 {"type":"post","bars":4,"harmony":"chorus","groove":"A","play":["drums","bass","chords","melody","arp"],"melody":"post","energy":0.8,"moves":[],"idea":"副歌之后不急着走，用一句短促的高音钩子再重复一遍记忆点。"},
 {"type":"verse","bars":8,"harmony":"verse","groove":"H","play":["drums","bass","chords","melody","arp"],"melody":"verse","energy":0.5,"moves":["half_time"],"idea":"第二段主歌改成半速，和第一段拉开差别，像车速慢下来。"},
 {"type":"chorus","bars":8,"harmony":"chorus","groove":"A","play":["drums","bass","chords","melody","arp","pad","perc"],"melody":"chorus","energy":0.9,"moves":["double_octave","full_stop"],"idea":"第二遍副歌更满，结尾连旋律一起停两拍，像开进隧道。"},
 {"type":"bridge","bars":8,"harmony":"bridge","groove":"H","play":["bass","chords","pad","arp"],"melody":"none","energy":0.45,"moves":["build"],"idea":"隧道里：和声走远，没有旋律，只有低音和铺底。"},
 {"type":"chorus","bars":8,"harmony":"chorus","groove":"A","play":["drums","bass","chords","melody","arp","pad","perc"],"melody":"chorus","energy":1,"moves":["key_up","harmony_vocal","counter_line","drop_first_bar"],"idea":"出隧道：第一小节先空一下，再整体升调，加上和声和对位。"},
 {"type":"outro","bars":8,"harmony":"chorus","groove":"H","play":["pad","arp","bass","melody"],"melody":"post","energy":0.3,"moves":[],"idea":"尾奏把记忆点轻轻再唱一遍，慢慢熄灭。"}],
"review":["演示数据：把第二段主歌改成半速，和第一段拉开差别","演示数据：第二遍副歌结尾加了两拍全停，给桥段让路","演示数据：最后一遍副歌第一小节先空一下再升调，冲击更大"]};

async function callLLM(system, user, temperature, deadline = Infinity) {
  const timeout = Math.min(Number(process.env.LLM_TIMEOUT || 240000), deadline - Date.now());
  if (timeout <= 0) throw new Error('生成已达到时间上限');
  const body = {
    model: P.model, temperature, max_tokens: 8000,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
  };
  if (P.json) body.response_format = { type: 'json_object' };
  // Qwen 3 thinking can take several minutes; default to direct generation. Set QWEN_THINKING=1 to enable thinking.
  if (PROVIDER === 'qwen' && process.env.QWEN_THINKING !== '1') body.enable_thinking = false;
  if (PROVIDER === 'aihubmix') {
    delete body.temperature; delete body.max_tokens;
    body.max_completion_tokens = 16000; body.reasoning_effort = 'medium';
  }
  const started=Date.now(),info={model:P.model,promptVersion:'arro-1.1',usage:null};
  try {
  const r = await (PROVIDER === 'aihubmix' ? completionFetch : fetch)(P.baseURL + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(Math.ceil(timeout))
  });
  const j = await r.json().catch(() => ({}));
  Object.assign(info,{status:r.status,model:j.model||P.model,usage:j.usage||null,finishReason:j.choices?.[0]?.finish_reason||null});
  if (!r.ok) throw Object.assign(new Error((j.error && (j.error.message || j.error.code)) || j.message || ('HTTP ' + r.status)), { status: r.status });
  return parseJSON(j.choices?.[0]?.message?.content);
  }catch(error){info.errorClass=error.name||'Error';throw error;}
  finally{telemetry.getStore()?.({...info,durationMs:Date.now()-started});}
}
// A repair includes concrete contract failures and the previous response, with a bounded call budget.
const repairRequest = (request, candidate, issues) => `${request}\n\n【返回格式和演奏数据核对】\n${issues.slice(0, 30).join('\n')}\n请修复这些具体问题，并返回包含全部字段的完整方案 JSON。音乐处理由你决定。${candidate ? `\n上次返回：\n${JSON.stringify(candidate)}` : ''}`;
const retryable = e => ![401, 403, 429].includes(e?.status) && !/timeout|aborted|时间上限|HTTP (401|403|429)/i.test(String(e?.name) + String(e?.message));

// One musical pass by default; explicit legacy review and each technical repair are bounded.
async function arrangeSong(mood, style, onStage = () => {}) {
  if (PROVIDER === 'mock') {
    await new Promise(r => setTimeout(r, 900));
    const twoPass = process.env.ARRANGE_PASSES === '2';
    return finalize({ ...structuredClone(MOCK_SONG), title: '演示：' + mood.slice(0, 8), passes: twoPass ? 2 : 1, review: twoPass ? MOCK_SONG.review : [], validation: { schema: true, review: twoPass ? 'complete' : 'skipped', durationWithinTarget: true } });
  }
  const deadline = Date.now() + 450000;
  const generation = { draftAttempts: 0, reviewAttempts: 0 };
  const ask = `画面或心情：${mood}${style ? `\n指定风格：${style}（style 必须填这个）` : ''}\n记谱支持转位和弦：斜线后的级数是当前调式中的低音，例如 5/7、1m7/b3。\n请输出整首歌的编曲方案 JSON。`;
  let draft, candidate, issues = [], lastError;
  onStage('draft');
  for (let i = 0; i < 2; i++) {
    try {
      generation.draftAttempts++;
      candidate = await callLLM(ENGLISH ? EN_SONG : SONG_SYSTEM, i ? repairRequest(ask, candidate, issues) : ask, 1.0, deadline);
      if (style && candidate && typeof candidate === 'object') candidate.style = style;
      issues = planIssues(candidate);
      if (!issues.length) { draft = candidate; break; }
    } catch (e) {
      lastError = e; issues = ['返回须为可解析的完整 JSON 对象'];
      if (!retryable(e)) break;
    }
  }
  if (!draft) throw lastError || new Error('大模型没有返回有效的整首方案：' + issues.slice(0, 3).join('；'));
  const draftDurationOK = planIssues(draft, { duration: true }).length === 0;
  if (process.env.ARRANGE_PASSES !== '2') return finalize({ ...draft, passes: 1, generation,
    validation: { schema: true, review: 'skipped', durationWithinTarget: draftDurationOK } });
  return reviseDraft(draft, mood, '', style, onStage, deadline, generation);
}

async function reviseDraft(draft, mood, direction, style, onStage, deadline, generation) {
  const draftDurationOK = planIssues(draft, { duration: true }).length === 0;
  let candidate, issues = [];
  onStage('review', draft);
  const request = `画面或心情：${mood}\n初稿：\n${JSON.stringify(draft)}\n\n${measureText(draft)}`;
  const instructions = direction ? `\n用户希望这次重点修改：${direction}` : '';
  candidate = undefined; issues = [];
  for (let i = 0; i < 2; i++) {
    try {
      generation.reviewAttempts++;
      candidate = await callLLM(ENGLISH ? EN_CRITIC : CRITIC_SYSTEM, i ? repairRequest(request + instructions, candidate, issues) : request + instructions, 0.7, deadline);
      if (style && candidate && typeof candidate === 'object') candidate.style = style;
      issues = planIssues(candidate, { review: true, duration: true });
      if (!issues.length) return finalize({ ...candidate, passes: 2, draftTitle: draft.title, generation,
        validation: { schema: true, review: 'complete', durationWithinTarget: true } });
    } catch (e) {
      issues = ['复审请求或 JSON 解析失败'];
      if (!retryable(e)) break;
    }
  }
  // Preserve only the validated draft when a complete revision cannot be obtained.
  return finalize({ ...draft, passes: 1, generation,
    validation: { schema: true, review: 'failed', durationWithinTarget: draftDurationOK },
    review: [`第二轮修改未通过完整性核对（${issues.slice(0, 3).join('；')}），当前保留初稿。`] });
}

// Optional musical revision is a separate user-triggered operation.
export async function refine(plan, mood, direction = '', onStage = () => {}) {
  const issues = planIssues(plan);
  if (issues.length) throw new Error('原方案未通过数据检查：' + issues.slice(0, 3).join('；'));
  const draft = structuredClone(plan);
  if (PROVIDER === 'mock') {
    onStage('review');
    return finalize({ ...draft, passes: 2, review: ['演示修改：保留原有结构与旋律', '演示修改：保留原有和声与律动', '演示模式只展示可选打磨流程'], validation: { schema: true, review: 'complete', durationWithinTarget: planIssues(draft, { duration: true }).length === 0 } });
  }
  return reviseDraft(draft, String(mood).slice(0, 120), String(direction).slice(0, 500), null, onStage, Date.now() + 450000, { draftAttempts: 0, reviewAttempts: 0 });
}

/* ============ Program measurements: factual review context and output consistency ============ */
// Compute duration and bar counts in code; provide facts while leaving musical judgment to the model.
function measureText(plan) {
  const m = measure(plan), bpm = m.bpm, barSec = 240 / bpm;
  const secs = (plan.sections || []).map((x, i) => `${i + 1}.${x.type} ${x.bars} 小节（${Math.round(playedBars(x.bars) * barSec)} 秒）`).join('；');
  const harm = Object.entries(plan.harmony || {}).map(([k, v]) => `${k} ${Array.isArray(v) ? v.length : 0} 个和弦`).join('，');
  const mel = Object.entries(plan.melodies || {}).map(([k, v]) => { const x = measure({ ...plan, sections: [{ type: 'chorus', bars: 8, melody: k }], melodies: { [k]: v } }).melody.chorus; return x ? `${k} ${x.notes} 个音、音域 ${x.range} 个半音` : `${k} 无法解析`; }).join('，');
  // Supply measurements and technical errors only. The producer makes musical judgments.
  const warn = flags(m).filter(f => /^(时长|段落小节数|有 \d+ 处写法|和声组不是|引用了不存在|未知手法)/.test(f));
  return `【程序测量（准确，以此为准）】
bpm ${bpm}，每小节 ${barSec.toFixed(2)} 秒；共 ${m.structure.sections} 段、${m.structure.playedBars} 小节，总时长 ${fmt(m.structure.playedSec)}。
按这个 bpm，2 分 40 秒到 3 分 30 秒对应 ${Math.ceil(160 / barSec)} 到 ${Math.floor(210 / barSec)} 小节${m.structure.playedBars < Math.ceil(160 / barSec) ? `，现在还差至少 ${Math.ceil(160 / barSec) - m.structure.playedBars} 小节` : m.structure.playedBars > Math.floor(210 / barSec) ? `，现在多了 ${m.structure.playedBars - Math.floor(210 / barSec)} 小节` : '，现在在范围内'}（改 bpm 的话按每小节 240 ÷ bpm 秒重新算）。
段落：${secs}
和声：${harm}；全曲共 ${m.harmony.uniqueChords} 种和弦。
旋律：${mel}。${warn.length ? `\n需要注意：${warn.join('；')}。` : ''}`;
}
// Normalize section lengths to 4/8 bars and append measured duration when review claims disagree.
function finalize(plan) {
  const notes = [];
  for (const x of plan.sections || []) {
    if (![4, 8].includes(+x.bars)) { const b = +x.bars > 5 ? 8 : 4; notes.push(`${x.type} 写的是 ${x.bars} 小节，按 ${b} 小节演奏`); x.bars = b; }
  }
  const m = measure(plan), real = m.structure.playedSec;
  const review = Array.isArray(plan.review) ? plan.review.slice() : [];
  if (m.consistency.reviewClaimOff) notes.push(`最终整首约 ${fmt(real)}（复审中的时长声明请以实际测量为准）`);
  return { ...plan, review, checks: notes.map(x => `程序核对：${x}。`), measured: { sec: real, bars: m.structure.playedBars } };
}

function parseJSON(text) {
  let t = String(text || '').replace(/```(?:json)?/gi, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('模型没有返回 JSON');
  return JSON.parse(t.slice(a, b + 1));
}

export async function arrange(mood, style, onStage) {
  if ((process.env.ARRANGE_MODE || 'song') === 'song') return arrangeSong(mood, style, onStage);
  return arrangeLoop(mood, style);
}
async function arrangeLoop(mood, style) {
  if (PROVIDER === 'mock') {
    await new Promise(r => setTimeout(r, 600));
    return { ...MOCK, title: '演示：' + mood.slice(0, 8) };
  }
  const body = {
    model: P.model,
    temperature: 1.0,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `画面或心情：${mood}${style ? `\n指定风格：${style}（style 必须填这个）` : ''}\n这次的创作方向：${FEELS[Math.floor(Math.random() * FEELS.length)]}。\n请输出 JSON。` }
    ]
  };
  if (P.json) body.response_format = { type: 'json_object' };
  const r = await fetch(P.baseURL + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j.error && (j.error.message || j.error.code)) || j.message || ('HTTP ' + r.status));
  return parseJSON(j.choices?.[0]?.message?.content);
}


export { measureText, finalize };   // Exported for evaluation and tests.

// Scoped revision is one producer pass, with technical validation only.
export async function reviseClip(project, scope, direction) {
  const context=revisionContext(project,scope);
  let candidate;
  if(PROVIDER==='mock') {
    const clip=project.tracks.find(t=>t.id===scope.trackId).clips.find(c=>c.id===scope.clipId);
    candidate={projectId:project.projectId,baseRevision:project.revision,...scope,explanation:'演示候选：调整当前片段的第一个音，供对比试听。',
      notes:clip.events.map((e,i)=>({pitch:i?e.pitch:(e.pitch+1)%128,startTick:e.startTick,durationTicks:Math.min(e.durationTicks,clip.durationTicks-e.startTick),velocity:Math.max(.01,Math.min(1.27,e.velocity))}))};
  } else {
    const system=readFileSync(new URL('./prompts/revision.en.txt',import.meta.url),'utf8');
    candidate=await callLLM(system,JSON.stringify({direction,currentProject:context}),.8,Date.now()+240000);
  }
  replacementEvents(project,scope,candidate);
  return candidate;
}
