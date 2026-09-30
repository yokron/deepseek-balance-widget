"""生成小组件效果示意图（mock，数字为示例数据）。

对应「只显示官方接口字段」版本：总额 / 赠金 / 充值 / 多币种 / 数据来源，没有图表。
"""

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
FAINT = (110, 116, 132)
BRAND = (123, 147, 255)
OK = (61, 214, 140)
WARN = (245, 176, 74)


def card(box, radius=44, outline=(52, 56, 70)):
    d.rounded_rectangle(box, radius=radius, fill=(24, 26, 34))
    d.rounded_rectangle(box, radius=radius, outline=outline, width=2)


def header(x, y, title, dot=OK, small=False):
    r = 6 if small else 7
    d.ellipse((x, y + 6, x + 2 * r, y + 6 + 2 * r), fill=dot)
    d.text((x + 2 * r + 10, y), title, font=f(MSYHB, 22 if small else 26), fill=DIM)


def amount(x, y, cur, value, size, color=TEXT):
    d.text((x, y + size * 0.32), cur, font=f(MSYHB, int(size * 0.34)), fill=DIM)
    d.text((x + size * 1.0, y), value, font=f(CONSB, size), fill=color)


def columns(x, y, items):
    for name, val, col in items:
        d.text((x, y), name, font=f(MSYH, 20), fill=DIM)
        d.text((x, y + 26), val, font=f(CONS, 28), fill=col)
        x += 150


ROWS = [("赠金", "10.00", OK), ("充值", "100.00", TEXT)]

# ---------------- 大号 ----------------
x0, y0, x1, y1 = 80, 130, 740, 560
card((x0, y0, x1, y1))
header(x0 + 34, y0 + 32, "DeepSeek 余额")
amount(x0 + 34, y0 + 72, "CNY", "110.00", 82)
columns(x0 + 34, y0 + 200, ROWS)
d.text((x0 + 34, y0 + 276), "USD", font=f(MSYHB, 24), fill=DIM)
d.text((x0 + 100, y0 + 272), "8.20", font=f(CONS, 28), fill=TEXT)
d.text((x0 + 34, y0 + 316), "数据来源：官方 GET /user/balance", font=f(MSYH, 20), fill=FAINT)
d.text((x0 + 34, y1 - 44), "官方数据 · 更新 6 分钟前", font=f(MSYH, 20), fill=DIM)

# ---------------- 中号 ----------------
mx0, my0, mx1, my1 = 80, 600, 740, 780
card((mx0, my0, mx1, my1), radius=40)
header(mx0 + 30, my0 + 18, "DeepSeek 余额", small=True)
amount(mx0 + 30, my0 + 52, "CNY", "110.00", 56)
columns(mx0 + 330, my0 + 58, ROWS)
d.text((mx0 + 30, my1 - 34), "官方数据 · 更新 6 分钟前", font=f(MSYH, 18), fill=DIM)

# ---------------- 小号（实时） ----------------
sx0, sy0, sx1, sy1 = 800, 130, 1080, 410
card((sx0, sy0, sx1, sy1))
header(sx0 + 28, sy0 + 22, "DeepSeek", small=True)
amount(sx0 + 28, sy0 + 62, "CNY", "110.00", 54)
columns(sx0 + 28, sy0 + 176, ROWS)
d.text((sx0 + 28, sy1 - 44), "官方数据 · 6 分钟前", font=f(MSYH, 17), fill=DIM)

# ---------------- 小号（缓存） ----------------
ox0, oy0, ox1, oy1 = 800, 440, 1080, 720
card((ox0, oy0, ox1, oy1))
header(ox0 + 28, oy0 + 22, "DeepSeek", dot=WARN, small=True)
amount(ox0 + 28, oy0 + 62, "CNY", "110.00", 54, color=(170, 174, 186))
columns(ox0 + 28, oy0 + 156, [("赠金", "10.00", (150, 130, 90)), ("充值", "100.00", (170, 174, 186))])
d.text((ox0 + 28, oy1 - 64), "缓存数据 · 3 小时前", font=f(MSYH, 17), fill=DIM)
d.ellipse((ox0 + 30, oy1 - 34, ox0 + 40, oy1 - 24), fill=WARN)
d.text((ox0 + 48, oy1 - 40), "网络不可用或请求超时", font=f(MSYH, 16), fill=WARN)

# ---------------- 说明 ----------------
d.text((80, 30), "DeepSeek 账户余额 · Scriptable 小组件效果示意", font=f(MSYHB, 34), fill=TEXT)
d.text((80, 74), "只显示官方 GET /user/balance 的字段（总额 / 赠金 / 充值 / 状态）· 数字为示例数据", font=f(MSYH, 22), fill=DIM)

img.save("preview.png")
print("preview.png", img.size)
