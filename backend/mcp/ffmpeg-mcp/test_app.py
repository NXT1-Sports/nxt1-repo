import ast
import json
from pathlib import Path
import re
import shlex
import subprocess
import tempfile
import unittest


def app_source() -> str:
    return Path(__file__).with_name('app.py').read_text(encoding='utf-8')


def load_ffmpeg_failure_helpers() -> dict:
    helper_names = {
        '_format_command',
        '_is_ffmpeg_banner_line',
        '_summarize_command_failure',
        '_assert_downloaded_input',
        '_expected_content_length',
    }
    helper_constants = {'_VIDEO_FILE_EXTENSIONS'}
    tree = ast.parse(app_source())
    module = ast.Module(
        body=[
            node
            for node in tree.body
            if (
                isinstance(node, ast.FunctionDef) and node.name in helper_names
            ) or (
                isinstance(node, ast.Assign)
                and any(isinstance(target, ast.Name) and target.id in helper_constants for target in node.targets)
            )
        ],
        type_ignores=[],
    )
    namespace = {
        'json': json,
        'Path': Path,
        're': re,
        'shlex': shlex,
        'subprocess': subprocess,
    }
    exec(compile(ast.fix_missing_locations(module), 'app.py', 'exec'), namespace)
    return namespace


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


class FfmpegFailureSummaryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.helpers = load_ffmpeg_failure_helpers()

    def test_failure_summary_omits_ffmpeg_build_configuration_banner(self):
        stderr = """ffmpeg version 7.1.3 Copyright
  built with gcc 12
  configuration: --enable-libiec61883 --enable-chromaprint --enable-libx264
  libavutil      59. 39.100 / 59. 39.100
  libavcodec     61. 19.100 / 61. 19.100
[in#0 @ 0x123] Error opening input: No such file or directory
Error opening input file /tmp/missing.mp4.
Error opening input files: No such file or directory
"""
        result = subprocess.CompletedProcess(
            args=['ffmpeg'],
            returncode=1,
            stdout=b'',
            stderr=stderr.encode(),
        )

        summary = self.helpers['_summarize_command_failure'](
            ['ffmpeg', '-y', '-i', '/tmp/missing.mp4', '/tmp/out.mp4'],
            result,
        )

        self.assertIn('exit_code=1', summary)
        self.assertIn('command=ffmpeg -y -i /tmp/missing.mp4 /tmp/out.mp4', summary)
        self.assertIn('Error opening input file /tmp/missing.mp4.', summary)
        self.assertNotIn('configuration:', summary)
        self.assertNotIn('--enable-libiec61883', summary)
        self.assertNotIn('ffmpeg version', summary)

    def test_download_validation_rejects_incomplete_file_before_ffmpeg(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / 'input.mp4'
            path.write_bytes(b'partial-video')

            with self.assertRaisesRegex(RuntimeError, 'incomplete'):
                self.helpers['_assert_downloaded_input'](
                    str(path),
                    url='https://example.test/input.mp4',
                    expected_bytes=1024,
                )

    def test_download_validation_reports_unreadable_video_probe_error(self):
        original_run = self.helpers['subprocess'].run

        def fake_run(*args, **kwargs):
            return subprocess.CompletedProcess(
                args=args[0],
                returncode=1,
                stdout='',
                stderr='[mov,mp4,m4a,3gp,3g2,mj2 @ 0x123] moov atom not found',
            )

        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / 'input.mp4'
            path.write_bytes(b'x' * 4096)
            self.helpers['subprocess'].run = fake_run
            try:
                with self.assertRaisesRegex(RuntimeError, 'moov atom not found'):
                    self.helpers['_assert_downloaded_input'](
                        str(path),
                        url='https://example.test/input.mp4',
                    )
            finally:
                self.helpers['subprocess'].run = original_run


if __name__ == '__main__':
    unittest.main()
