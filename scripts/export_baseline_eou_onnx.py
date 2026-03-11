from pathlib import Path

import numpy as np
import onnx
from onnx import TensorProto, checker, helper

FEATURE_COUNT = 12
WEIGHTS = np.array(
    [
        [2.15],
        [0.24],
        [-0.82],
        [0.92],
        [1.48],
        [0.54],
        [1.06],
        [-1.28],
        [0.96],
        [0.38],
        [-0.84],
        [1.75],
    ],
    dtype=np.float32,
)
BIAS = np.array([-1.94], dtype=np.float32)

project_root = Path(__file__).resolve().parents[1]
output_path = project_root / "public" / "models" / "baseline-eou.onnx"
output_path.parent.mkdir(parents=True, exist_ok=True)

graph = helper.make_graph(
    nodes=[
        helper.make_node("MatMul", ["features", "W"], ["matmul_out"]),
        helper.make_node("Add", ["matmul_out", "B"], ["logit"]),
        helper.make_node("Sigmoid", ["logit"], ["probability"]),
    ],
    name="baseline_eou_classifier",
    inputs=[
        helper.make_tensor_value_info("features", TensorProto.FLOAT, [None, FEATURE_COUNT]),
    ],
    outputs=[
        helper.make_tensor_value_info("probability", TensorProto.FLOAT, [None, 1]),
    ],
    initializer=[
        helper.make_tensor("W", TensorProto.FLOAT, WEIGHTS.shape, WEIGHTS.flatten().tolist()),
        helper.make_tensor("B", TensorProto.FLOAT, BIAS.shape, BIAS.tolist()),
    ],
)

model = helper.make_model(
    graph,
    producer_name="audio-pipeline",
    opset_imports=[helper.make_operatorsetid("", 13)],
)
checker.check_model(model)
onnx.save(model, output_path)

print(f"Exported {output_path.relative_to(project_root)}")
