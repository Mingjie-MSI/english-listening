# 每日英语听力（托福难度）

每天 30 分钟：**精听 15 分钟 + 泛听 15 分钟**。App 每天自动安排听什么，你只要打开、听、打卡。电脑和安卓手机都能用，手机上可以「添加到主屏幕」，像普通 App 一样打开。

## 学习计划

| 阶段 | 精听（15 分钟） | 泛听（15 分钟） |
|---|---|---|
| 阶段一 · 打基础（第 1–4 周） | BBC 6 Minute English 全篇（约 6 分钟，有原文） | NPR Short Wave 科普（约 12–15 分钟） |
| 阶段二 · 适应原速（第 5–8 周） | NPR Short Wave 选 4 分钟片段（有原文） | TED 演讲 与 Planet Money 交替 |
| 阶段三 · 托福讲座难度（第 9 周起） | TED 演讲选 5 分钟片段（有原文），边听边记笔记 | BBC In Our Time 学术讨论（每期分 3–4 天听完） |

- 第 28、56、84 个学习日：做一次 **ETS 官方免费托福模拟题**（只做听力部分），记录成绩，对比进步。
- 阶段按「完成的学习日」推进，漏掉几天不会直接跳到更难的材料。觉得太难或太简单，可以在「设置」里手动换阶段。

**精听四步**：盲听一遍并给理解程度打分 → 分句精听（⟲5 秒回放、A/B 循环） → 对照原文找出没听出的地方 → 影子跟读 2–3 分钟。

**泛听两步**：原速听完不看原文 → 用英文写一两句概括。

## 材料来源

都是官方免费播客，每天更新。音频直接从官方服务器播放；原文点链接去官网看（BBC Learning English、NPR、TED 官网都有）。

- BBC 6 Minute English（BBC Learning English）
- NPR Short Wave、NPR Planet Money
- TED Talks Daily（自动跳过歌曲表演和其他节目的串台）
- BBC In Our Time（没有原文）

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
python -m http.server 8820           # 然后浏览器打开 http://127.0.0.1:8820
```

`tools/make_icons.py` 用来重新生成图标。
