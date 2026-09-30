"""生成小组件效果示意图（mock，数字为示例数据）。"""

from PIL import Image, ImageDraw, ImageFont

W, H = 1280, 820
img = Image.new("RGB", (W, H), (16, 18, 26))
d = ImageDraw.Draw(img)

for y in range(H):
    t = y / H
    d.line([(0, y), (W, y)], fill=(int(28 + 22 * t), int(30 + 24 * t), int(52 + 40 * t)))

MSYH = "C:/Windows/Fonts/msyh.ttc"
MSYHB = "C:/Windows/Fonts/msyhbd.ttc"
CONS = "C:/Windows/Fonts/consola.ttf"
CONSB = "C:/Windows/Fonts/consolab.ttf"
f = lambda p, s: ImageFont.truetype(p, s)

TEXT = (240, 242, 248)
DIM = (150, 156, 172)
BRAND = (123, 147, 255)
BRAND_SOFT = (44, 58, 108)
OK = (61, 214, 140)
WARN = (245, 176, 74)


def card(box, radius=44, fill=(24, 26, 34), outline=(52, 56, 70)):
    d.rounded_rectangle(box, radius=radius, fill=fill)
    d.rounded_rectangle(box, radius=radius, outline=outline, width=2)


def header(x, y, title, dot=OK, small=False):
    r = 6 if small else 7
    d.ellipse((x, y + 6, x + 2 * r, y + 6 + 2 * r), fill=dot)
    d.text((x + 2 * r + 10, y), title, font=f(MSYHB, 22 if small else 26), fill=DIM)


def big_amount(x, y, cur, amount, size, color=TEXT):
    d.text((x, y + size * 0.32), cur, font=f(MSYHB, int(size * 0.36)), fill=DIM)
    d.text((x + size * 1.05, y), amount, font=f(CONSB, size), fill=color)


def columns(x, y, items):
    for name, val, col in items:
        d.text((x, y), name, font=f(MSYH, 20), fill=DIM)
        d.text((x, y + 26), val, font=f(CONS, 28), fill=col)
        x += 150


def spend_bars(x0, y0, x1, y1, values, color=BRAND, mid=(58, 74, 132), faint=(38, 44, 72)):
    """消费直方图：当天最高的柱子高亮，零消费只留基线。"""
    mx = max(values) or 1
    n = len(values)
    gap = 3
    bw = (x1 - x0 - gap * (n - 1)) / n
    for i, v in enumerate(values):
        h = max(2, (v / mx) * (y1 - y0)) if v > 0 else 2
        bx = x0 + i * (bw + gap)
        col = color if v >= mx - 1e-9 else (mid if v > 0 else faint)
        d.rounded_rectangle((bx, y1 - h, bx + bw, y1), radius=1.5, fill=col)
    d.line([(x0, y1 + 1), (x1, y1 + 1)], fill=faint, width=1)


# 13 周 ≈ 一个季度（按周聚合的消费）
WEEKLY = [0.8, 1.2, 0.5, 0.0, 2.1, 1.4, 0.9, 3.2, 1.1, 0.6, 0.4, 1.8, 2.4]
LIVE = [("充值", "100.00", TEXT), ("累计消费", "12.40", WARN)]
LIVE_S = [("充值", "100.00", TEXT), ("累计消费", "12.40", WARN)]

# ---------------- 大号 ----------------
x0, y0, x1, y1 = 80, 130, 740, 560
card((x0, y0, x1, y1))
header(x0 + 34, y0 + 32, "DeepSeek 余额")
big_amount(x0 + 34, y0 + 60, "CNY", "110.00", 74)
columns(x0 + 34, y0 + 162, LIVE)
spend_bars(x0 + 40, y0 + 240, x0 + 620, y0 + 320, WEEKLY)
d.text((x0 + 34, y0 + 334), "近 13 周（约一季度）· 合计 16.40 · 单周最高 3.20", font=f(MSYH, 20), fill=DIM)
d.text((x0 + 34, y0 + 358), "消费记录自 09-30 14:20 起累计（接口不提供历史账单）", font=f(MSYH, 18), fill=(110, 116, 132))
d.text((x0 + 34, y1 - 40), "更新 6 分钟前", font=f(MSYH, 20), fill=DIM)

# ---------------- 中号 ----------------
mx0, my0, mx1, my1 = 80, 600, 740, 780
card((mx0, my0, mx1, my1), radius=40)
header(mx0 + 30, my0 + 18, "DeepSeek 余额", small=True)
big_amount(mx0 + 30, my0 + 48, "CNY", "110.00", 54)
columns(mx0 + 420, my0 + 52, LIVE)
spend_bars(mx0 + 360, my0 + 106, mx0 + 620, my0 + 132, WEEKLY)
d.text((mx0 + 30, my1 - 34), "更新 6 分钟前", font=f(MSYH, 18), fill=DIM)

# ---------------- 小号（实时） ----------------
sx0, sy0, sx1, sy1 = 800, 130, 1080, 410
card((sx0, sy0, sx1, sy1))
header(sx0 + 28, sy0 + 22, "DeepSeek", small=True)
big_amount(sx0 + 28, sy0 + 60, "CNY", "110.00", 52)
columns(sx0 + 28, sy0 + 168, LIVE_S)
d.text((sx0 + 28, sy1 - 44), "更新 6 分钟前", font=f(MSYH, 17), fill=DIM)

# ---------------- 小号（离线缓存） ----------------
ox0, oy0, ox1, oy1 = 800, 440, 1080, 720
card((ox0, oy0, ox1, oy1))
header(ox0 + 28, oy0 + 22, "DeepSeek", dot=WARN, small=True)
big_amount(ox0 + 28, oy0 + 60, "CNY", "110.00", 52, color=(170, 174, 186))
columns(ox0 + 28, oy0 + 150, [("充值", "100.00", (170, 174, 186)), ("累计消费", "12.40", (150, 130, 90))])
d.text((ox0 + 28, oy1 - 64), "离线数据 · 3 小时前", font=f(MSYH, 17), fill=DIM)
d.ellipse((ox0 + 30, oy1 - 34, ox0 + 40, oy1 - 24), fill=WARN)
d.text((ox0 + 48, oy1 - 40), "网络不可用或请求超时", font=f(MSYH, 16), fill=WARN)

# ---------------- 说明 ----------------
d.text((80, 30), "DeepSeek 账户余额 · Scriptable 小组件效果示意", font=f(MSYHB, 34), fill=TEXT)
d.text((80, 74), "左：大号 / 中号  右：小号（实时）与小号（离线缓存）· 数字为示例数据", font=f(MSYH, 22), fill=DIM)

img.save("preview.png")
print("preview.png", img.size)
