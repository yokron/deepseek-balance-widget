"""生成小组件效果示意图（mock，仅用于说明布局）。"""

from PIL import Image, ImageDraw, ImageFont

W, H = 1280, 820
img = Image.new("RGB", (W, H), (16, 18, 26))
d = ImageDraw.Draw(img)

# 背景渐变
for y in range(H):
    t = y / H
    r = int(28 + 22 * t)
    g = int(30 + 24 * t)
    b = int(52 + 40 * t)
    d.line([(0, y), (W, y)], fill=(r, g, b))

MSYH = "C:/Windows/Fonts/msyh.ttc"
MSYHB = "C:/Windows/Fonts/msyhbd.ttc"
CONS = "C:/Windows/Fonts/consola.ttf"
CONSB = "C:/Windows/Fonts/consolab.ttf"


def f(path, size):
    return ImageFont.truetype(path, size)


def rounded(box, radius, fill, outline=None, width=1):
    d.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


TEXT = (240, 242, 248)
DIM = (150, 156, 172)
BRAND = (123, 147, 255)
OK = (61, 214, 140)
WARN = (245, 176, 74)

# ---------------- 大号组件 ----------------
x0, y0, x1, y1 = 80, 130, 740, 560
rounded((x0, y0, x1, y1), 44, (24, 26, 34))
d.rounded_rectangle((x0, y0, x1, y1), radius=44, outline=(52, 56, 70), width=2)

d.ellipse((x0 + 34, y0 + 40, x0 + 48, y0 + 54), fill=OK)
d.text((x0 + 60, y0 + 32), "DeepSeek 余额", font=f(MSYHB, 26), fill=DIM)

d.text((x0 + 34, y0 + 78), "CNY", font=f(MSYHB, 26), fill=DIM)
d.text((x0 + 110, y0 + 58), "110.00", font=f(CONSB, 74), fill=TEXT)

labels = [("赠送", "10.00", TEXT), ("充值", "100.00", TEXT), ("已用", "36.42", WARN)]
cx = x0 + 34
for name, val, col in labels:
    d.text((cx, y0 + 162), name, font=f(MSYH, 20), fill=DIM)
    d.text((cx, y0 + 188), val, font=f(CONS, 28), fill=col)
    cx += 150

d.text((x0 + 34, y0 + 240), "USD 8.20", font=f(CONS, 22), fill=DIM)

# 折线
pts = [(0, 46), (40, 42), (80, 44), (120, 36), (160, 30), (200, 24), (240, 26),
       (280, 18), (320, 22), (360, 14), (400, 10), (440, 16), (480, 8),
       (520, 4), (560, 12), (600, 6), (640, 2)]
poly = [(x0 + 40 + px, y0 + 330 - py) for px, py in pts]
d.line(poly, fill=BRAND, width=4, joint="curve")
d.ellipse((poly[-1][0] - 7, poly[-1][1] - 7, poly[-1][0] + 7, poly[-1][1] + 7), fill=BRAND)
d.text((x0 + 34, y0 + 348), "近 17 次记录", font=f(MSYH, 20), fill=DIM)

d.text((x0 + 34, y1 - 44), "更新 6 分钟前", font=f(MSYH, 20), fill=DIM)

# ---------------- 中号组件 ----------------
mx0, my0, mx1, my1 = 80, 600, 740, 780
rounded((mx0, my0, mx1, my1), 40, (24, 26, 34))
d.rounded_rectangle((mx0, my0, mx1, my1), radius=40, outline=(52, 56, 70), width=2)
d.ellipse((mx0 + 30, my0 + 26, mx0 + 44, my0 + 40), fill=OK)
d.text((mx0 + 56, my0 + 18), "DeepSeek 余额", font=f(MSYHB, 24), fill=DIM)
d.text((mx0 + 30, my0 + 62), "CNY", font=f(MSYHB, 22), fill=DIM)
d.text((mx0 + 92, my0 + 48), "110.00", font=f(CONSB, 54), fill=TEXT)
cx = mx0 + 420
for name, val in [("赠送", "10.00"), ("充值", "100.00")]:
    d.text((cx, my0 + 52), name, font=f(MSYH, 18), fill=DIM)
    d.text((cx, my0 + 74), val, font=f(CONS, 24), fill=TEXT)
    cx += 120

# ---------------- 小号组件 ----------------
sx0, sy0, sx1, sy1 = 800, 130, 1080, 410
rounded((sx0, sy0, sx1, sy1), 44, (24, 26, 34))
d.rounded_rectangle((sx0, sy0, sx1, sy1), radius=44, outline=(52, 56, 70), width=2)
d.ellipse((sx0 + 28, sy0 + 30, sx0 + 40, sy0 + 42), fill=OK)
d.text((sx0 + 50, sy0 + 22), "DeepSeek", font=f(MSYHB, 22), fill=DIM)
d.text((sx0 + 28, sy0 + 66), "CNY", font=f(MSYHB, 20), fill=DIM)
d.text((sx0 + 28, sy0 + 92), "110.00", font=f(CONSB, 52), fill=TEXT)
d.text((sx0 + 28, sy0 + 168), "赠送", font=f(MSYH, 17), fill=DIM)
d.text((sx0 + 28, sy0 + 190), "10.00", font=f(CONS, 22), fill=TEXT)
d.text((sx0 + 150, sy0 + 168), "充值", font=f(MSYH, 17), fill=DIM)
d.text((sx0 + 150, sy0 + 190), "100.00", font=f(CONS, 22), fill=TEXT)
d.text((sx0 + 28, sy1 - 44), "更新 6 分钟前", font=f(MSYH, 17), fill=DIM)

# ---------------- 离线状态 ----------------
ox0, oy0, ox1, oy1 = 800, 440, 1080, 720
rounded((ox0, oy0, ox1, oy1), 44, (24, 26, 34))
d.rounded_rectangle((ox0, oy0, ox1, oy1), radius=44, outline=(52, 56, 70), width=2)
d.ellipse((ox0 + 28, oy0 + 30, ox0 + 40, oy0 + 42), fill=WARN)
d.text((ox0 + 50, oy0 + 22), "DeepSeek", font=f(MSYHB, 22), fill=DIM)
d.text((ox0 + 28, oy0 + 66), "CNY", font=f(MSYHB, 20), fill=DIM)
d.text((ox0 + 28, oy0 + 92), "110.00", font=f(CONSB, 52), fill=(170, 174, 186))
d.text((ox0 + 28, oy0 + 168), "赠送", font=f(MSYH, 17), fill=DIM)
d.text((ox0 + 28, oy0 + 190), "10.00", font=f(CONS, 22), fill=(170, 174, 186))
d.text((ox0 + 150, oy0 + 168), "充值", font=f(MSYH, 17), fill=DIM)
d.text((ox0 + 150, oy0 + 190), "100.00", font=f(CONS, 22), fill=(170, 174, 186))
d.text((ox0 + 28, oy1 - 64), "离线数据 · 3 小时前", font=f(MSYH, 17), fill=DIM)
d.ellipse((ox0 + 30, oy1 - 34, ox0 + 40, oy1 - 24), fill=WARN)
d.text((ox0 + 48, oy1 - 40), "网络不可用或请求超时", font=f(MSYH, 16), fill=WARN)

# 底部说明
d.text((80, 30), "DeepSeek API 余额 · Scriptable 小组件效果示意", font=f(MSYHB, 34), fill=TEXT)
d.text((80, 74), "左：大号 / 中号  右：小号（实时）与小号（离线缓存）", font=f(MSYH, 22), fill=DIM)

img.save("preview.png")
print("preview.png", img.size)
