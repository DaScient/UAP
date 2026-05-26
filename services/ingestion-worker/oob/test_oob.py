import unittest

from oob.oob import analyse_event


class TestOoB(unittest.TestCase):
    def test_flags_gap_for_hypersonic_without_thermal_signature(self) -> None:
        analysis = analyse_event(
            {
                "speed_mps": 2000,
                "thermal_signature_present": False,
                "domain_presence": "trans-medium",
                "military_capability_match": False,
            }
        )
        self.assertTrue(analysis["anomalous_gap_identifier"]["is_gap"])


if __name__ == "__main__":
    unittest.main()
