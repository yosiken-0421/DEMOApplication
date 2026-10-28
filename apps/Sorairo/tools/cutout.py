"""art/heroes.png と art/monsters.png から背景を切り抜いて art/cut/ に保存する（初回だけ。要 onnxruntime と isnet モデル）。
モデル: https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-anime.onnx / isnet-general-use.onnx を tools/models/ に置く。
切り抜きが崩れたまものは保存せず、ゲーム側でぼかし表示にする（GOOD 以外）。"""
print(__doc__)
