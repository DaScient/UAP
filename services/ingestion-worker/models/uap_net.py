"""PyTorch multimodal model for UAP event classification."""

from __future__ import annotations

import torch
from torch import Tensor, nn
import torch.nn.functional as F


class UAPNet(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.visual_branch = nn.Sequential(
            nn.Conv2d(3, 32, kernel_size=3, stride=2, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(inplace=True),
            nn.Conv2d(32, 64, kernel_size=3, stride=2, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=True),
            nn.Conv2d(64, 128, kernel_size=3, stride=2, padding=1),
            nn.BatchNorm2d(128),
            nn.ReLU(inplace=True),
            nn.AdaptiveAvgPool2d(1),
            nn.Flatten(),
        )
        self.telemetry_branch = nn.Sequential(
            nn.Linear(5, 128),
            nn.ReLU(inplace=True),
            nn.Linear(128, 256),
            nn.ReLU(inplace=True),
            nn.Linear(256, 512),
            nn.ReLU(inplace=True),
        )
        self.missing_visual_embedding = nn.Parameter(torch.zeros(128))
        self.missing_telemetry_embedding = nn.Parameter(torch.zeros(512))
        self.shape_head = nn.Linear(640, 5)
        self.kinematic_head = nn.Linear(640, 4)

    def forward(self, visual_input: Tensor | None, telemetry_input: Tensor | None) -> tuple[Tensor, Tensor]:
        if visual_input is None:
            batch_size = telemetry_input.shape[0] if telemetry_input is not None else 1
            visual_features = self.missing_visual_embedding.detach().unsqueeze(0).expand(batch_size, -1)
        else:
            visual_features = self.visual_branch(visual_input)
            batch_size = visual_features.shape[0]

        if telemetry_input is None:
            telemetry_features = self.missing_telemetry_embedding.detach().unsqueeze(0).expand(batch_size, -1)
        else:
            telemetry_features = self.telemetry_branch(telemetry_input)

        fused = torch.cat([visual_features, telemetry_features], dim=1)
        return self.shape_head(fused), self.kinematic_head(fused)

    @staticmethod
    def compute_loss(
        shape_logits: Tensor,
        kinematic_logits: Tensor,
        shape_targets: Tensor,
        kinematic_targets: Tensor,
        alpha: float = 1.0,
        beta: float = 1.0,
    ) -> Tensor:
        shape_loss = F.cross_entropy(shape_logits, shape_targets)
        kinematic_loss = F.cross_entropy(kinematic_logits, kinematic_targets)
        return alpha * shape_loss + beta * kinematic_loss


def save_onnx(model: UAPNet, dummy_visual: Tensor, dummy_telemetry: Tensor, path: str) -> None:
    model.eval()
    torch.onnx.export(
        model,
        (dummy_visual, dummy_telemetry),
        path,
        input_names=["visual_input", "telemetry_input"],
        output_names=["shape_logits", "kinematic_logits"],
        dynamic_axes={
            "visual_input": {0: "batch"},
            "telemetry_input": {0: "batch"},
            "shape_logits": {0: "batch"},
            "kinematic_logits": {0: "batch"},
        },
        opset_version=17,
    )
