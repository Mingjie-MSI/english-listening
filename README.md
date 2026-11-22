# 每日英语听力（托福难度）

每天 30 分钟：**精听 15 分钟 + 泛听 15 分钟**。App 每天自动安排听什么，你只要打开、听、打卡。电脑和安卓手机都能用，手机上可以「添加到主屏幕」，像普通 App 一样打开。

## 学习计划

每天按顺序轮换节目：美音和英音交替，日常生活、职场对话、科普、学术都有。

| 阶段 | 精听（15 分钟，有原文） | 泛听（15 分钟） |
|---|---|---|
| 阶段一 · 打基础（第 1–4 周） | BBC 6 Minute English 全篇（🇬🇧）/ NPR Life Kit 生活话题选 4 分钟（🇺🇸） | All Ears English 日常口语（🇺🇸）/ The Archers 英国生活剧（🇬🇧）/ NPR Short Wave 科普（🇺🇸） |
| 阶段二 · 适应原速（第 5–8 周） | Life Kit / 6 Minute English / Short Wave，各选 4 分钟左右 | Business English Pod 职场对话 / The Archers / All Ears English / TED 演讲 |
| 阶段三 · 托福难度（第 9 周起） | TED 演讲 / Life Kit 各选 5 分钟，边听边记笔记 | 职场对话 / The Archers / In Our Time 学术讨论（🇬🇧）/ Planet Money / All Ears English |

超过约 22 分钟的节目会分成几天听完，听完再换下一个节目。

- 第 28、56、84 个学习日：做一次 **ETS 官方免费托福模拟题**（只做听力部分），记录成绩，对比进步。
- 阶段按「完成的学习日」推进，漏掉几天不会直接跳到更难的材料。觉得太难或太简单，可以在「设置」里手动换阶段。

**App 里看原文**：点「📄 原文 + 中文」，原文直接显示在播放器下面，一行英文一行中文。
- 播放时，正在读的那句会高亮，并自动滚到那里（取消「跟随播放」就不自动滚）。
- 点任意一句，就从这句开始播放，适合分句精听。
- 黄色标出的是比较少见的词：点一下看中文释义，可以「加到笔记」，或者点「认识了」以后不再标出。
- 取消「中文」勾选，就只看英文。
- 声音和高亮的句子对不上时：播放中点「⏱ 校准」，再点现在正在读的那一句，后面的句子就按它对齐；点「还原」取消。
  NPR、TED、All Ears English 的音频里会插入广告，每个人听到的广告长短不一样，所以时间可能差一些，App 会先自动估一个偏移。BBC 的节目用的是没有广告的音频，不会有这个问题。

原文、每句话的时间、中文翻译和生词，每天由 GitHub 自动生成：
- 有官方原文的节目（BBC 6 Minute English、NPR、TED），用官方原文；
- 没有官方原文的节目（The Archers、All Ears English、Business English Pod），用语音识别自动生成，个别词可能不准；
- 中文用开源翻译模型 NLLB 翻译，仅供参考；生词释义来自开源词典 ECDICT。

刚出的新节目要等第二天凌晨自动处理完才有。还没处理的节目，「原文」仍然链接到官网。

**精听四步**：盲听一遍并给理解程度打分 → 分句精听（⟲5 秒回放、A/B 循环） → 对照原文找出没听出的地方 → 影子跟读 2–3 分钟。

**泛听两步**：原速听完不看原文 → 用英文写一两句概括。

## 材料来源

都是官方免费播客，每天更新。音频直接从官方服务器播放；原文点链接去官网看（BBC Learning English、NPR、TED 官网都有）。

- 日常生活：NPR Life Kit（🇺🇸，有原文）、All Ears English（🇺🇸）、BBC The Archers（🇬🇧 广播剧）
- 职场：Business English Pod（开会、面试、电话、谈判等场景对话）
- 话题 / 科普：BBC 6 Minute English（🇬🇧，有原文）、NPR Short Wave、NPR Planet Money（🇺🇸，有原文）
- 演讲 / 学术：TED Talks Daily（自动跳过歌曲表演和串台）、BBC In Our Time（🇬🇧，没有原文）

## 放到 GitHub Pages 上（一次性设置，约 10 分钟）

1. 注册 GitHub 账号：https://github.com/signup （免费）。
2. 新建仓库：右上角 **+ → New repository**，名字填 `english-listening`（随意），选 **Public**，点 **Create repository**。
3. 上传文件：在新仓库页面点 **uploading an existing file**，把本文件夹里的**所有内容**（不是文件夹本身）拖进去：
   `index.html`、`app.js`、`style.css`、`sw.js`、`manifest.webmanifest`、`.nojekyll`、`README.md`，以及 `icons`、`data`、`tools`、`.github` 四个文件夹。点 **Commit changes**。
4. 打开网站：仓库 **Settings → Pages**，Source 选 **Deploy from a branch**，Branch 选 **main**、文件夹 **/ (root)**，点 **Save**。1–2 分钟后，页面顶部会显示网址，类似 `https://你的用户名.github.io/english-listening/`。
5. 允许每天自动更新节目单：仓库 **Settings → Actions → General**，最下面 **Workflow permissions** 选 **Read and write permissions**，点 **Save**。
6. 手动跑一次检查：仓库 **Actions** 标签 → 左边 **Update episodes** → **Run workflow**。变成绿色 ✓ 就好了。以后每天新加坡时间凌晨 4:30 会自动更新。
   - 如果 Actions 里看不到 **Update episodes**，说明 `.github` 文件夹没传上去：点 **Add file → Create new file**，文件名填 `.github/workflows/update-episodes.yml`，把本文件夹里同名文件的内容粘贴进去，提交即可。

## 在手机和电脑上使用

- **安卓手机**：用 Chrome 打开上面的网址 → 右上角 **⋮ → 添加到主屏幕**（或「安装应用」）。之后从桌面图标打开，锁屏时也能继续播放。
- **电脑**：Chrome / Edge 打开网址，地址栏右边的「安装」图标可以装成桌面应用；也可以直接加书签。
  电脑上的快捷键：空格 播放/暂停，← / → 后退/前进 5 秒。
- **进度同步**：进度保存在每台设备自己的浏览器里。想换设备时，在「设置」里「导出进度」，把文件传到另一台设备，再「导入进度」。

## 本地测试（可选）

```
python tools/fetch_feeds.py          # 更新 data/episodes.json
pip install -r tools/requirements.txt
python tools/build_transcripts.py 2  # 生成 App 里的原文（数字 = 最多处理几集；语音识别比较慢）
python -m http.server 8820           # 然后浏览器打开 http://127.0.0.1:8820
```

生成的原文放在 `data/tx/` 里。第一次运行会下载语音识别模型、翻译模型（约 600 MB）和词典（约 66 MB）。

`tools/make_icons.py` 用来重新生成图标。
