from pathlib import Path
import unittest


def app_source() -> str:
    return Path(__file__).with_name('app.py').read_text(encoding='utf-8')


class MobileH264NormalizationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = app_source()

    def test_mobile_scale_filter_forces_limited_range_yuv420p(self):
        self.assertIn('in_range=auto:out_range=tv', self.source)
        self.assertIn('format=yuv420p,setparams=range=tv', self.source)

    def test_mobile_h264_args_disable_full_range_output(self):
        self.assertIn('"-pix_fmt",\n        "yuv420p"', self.source)
        self.assertIn('"-color_range",\n        "tv"', self.source)
        self.assertIn('"fullrange=off:"', self.source)


if __name__ == '__main__':
    unittest.main()