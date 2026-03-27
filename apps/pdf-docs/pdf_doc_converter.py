#!/usr/bin/env python3
"""
Simple CLI tool to convert:
- PDF -> DOCX (using pdf2docx)
- DOCX -> PDF (using LibreOffice)
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path


def pdf_to_docx(input_path: Path, output_path: Path, start: int = 0, end: int | None = None) -> None:
    try:
        from pdf2docx import Converter
    except ImportError as exc:
        raise RuntimeError(
            "Missing dependency 'pdf2docx'. Install requirements first."
        ) from exc

    cv = Converter(str(input_path))
    try:
        cv.convert(str(output_path), start=start, end=end)
    finally:
        cv.close()


def docx_to_pdf(input_path: Path, output_path: Path) -> None:
    libreoffice = shutil.which("libreoffice")
    if not libreoffice:
        raise RuntimeError(
            "LibreOffice CLI not found. Install LibreOffice and ensure 'libreoffice' is in PATH."
        )

    out_dir = output_path.parent
    command = [
        libreoffice,
        "--headless",
        "--convert-to",
        "pdf",
        "--outdir",
        str(out_dir),
        str(input_path),
    ]
    subprocess.run(command, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

    generated_pdf = out_dir / f"{input_path.stem}.pdf"
    if not generated_pdf.exists():
        raise RuntimeError("Conversion appeared to succeed, but output PDF was not found.")

    if generated_pdf.resolve() != output_path.resolve():
        generated_pdf.replace(output_path)


def validate_input(path: Path, expected_suffix: str) -> Path:
    if not path.exists():
        raise FileNotFoundError(f"Input file does not exist: {path}")
    if path.suffix.lower() != expected_suffix:
        raise ValueError(f"Expected a {expected_suffix} file, got: {path.suffix}")
    return path


def default_output_path(input_path: Path, new_suffix: str) -> Path:
    return input_path.with_suffix(new_suffix)


def iter_files(input_dir: Path, suffix: str, recursive: bool) -> list[Path]:
    pattern = f"**/*{suffix}" if recursive else f"*{suffix}"
    return sorted(path for path in input_dir.glob(pattern) if path.is_file())


def batch_pdf_to_docx(input_dir: Path, output_dir: Path, recursive: bool, overwrite: bool) -> tuple[int, int]:
    files = iter_files(input_dir, ".pdf", recursive)
    success = 0
    failed = 0
    for file in files:
        if recursive:
            relative = file.relative_to(input_dir)
            out_file = output_dir / relative.with_suffix(".docx")
        else:
            out_file = output_dir / f"{file.stem}.docx"
        out_file.parent.mkdir(parents=True, exist_ok=True)
        if out_file.exists() and not overwrite:
            print(f"Skipped (exists): {out_file}")
            continue
        try:
            pdf_to_docx(file, out_file)
            print(f"Converted PDF -> DOCX: {file} -> {out_file}")
            success += 1
        except Exception as exc:
            print(f"Failed: {file} ({exc})", file=sys.stderr)
            failed += 1
    return success, failed


def batch_docx_to_pdf(input_dir: Path, output_dir: Path, recursive: bool, overwrite: bool) -> tuple[int, int]:
    files = iter_files(input_dir, ".docx", recursive)
    success = 0
    failed = 0
    for file in files:
        if recursive:
            relative = file.relative_to(input_dir)
            out_file = output_dir / relative.with_suffix(".pdf")
        else:
            out_file = output_dir / f"{file.stem}.pdf"
        out_file.parent.mkdir(parents=True, exist_ok=True)
        if out_file.exists() and not overwrite:
            print(f"Skipped (exists): {out_file}")
            continue
        try:
            docx_to_pdf(file, out_file)
            print(f"Converted DOCX -> PDF: {file} -> {out_file}")
            success += 1
        except Exception as exc:
            print(f"Failed: {file} ({exc})", file=sys.stderr)
            failed += 1
    return success, failed


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Convert PDF and DOCX files.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    pdf2docx_parser = subparsers.add_parser("pdf2docx", help="Convert PDF to DOCX.")
    pdf2docx_parser.add_argument("input", type=Path, help="Input PDF file path.")
    pdf2docx_parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="Output DOCX file path. Defaults to input name with .docx extension.",
    )
    pdf2docx_parser.add_argument(
        "--start-page",
        type=int,
        default=0,
        help="Start page (0-based). Default: 0.",
    )
    pdf2docx_parser.add_argument(
        "--end-page",
        type=int,
        default=None,
        help="End page (0-based, exclusive). Default: all pages.",
    )

    docx2pdf_parser = subparsers.add_parser("docx2pdf", help="Convert DOCX to PDF.")
    docx2pdf_parser.add_argument("input", type=Path, help="Input DOCX file path.")
    docx2pdf_parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="Output PDF file path. Defaults to input name with .pdf extension.",
    )

    batch_pdf2docx_parser = subparsers.add_parser(
        "batch-pdf2docx", help="Convert all PDF files in a folder to DOCX."
    )
    batch_pdf2docx_parser.add_argument("input_dir", type=Path, help="Folder containing PDF files.")
    batch_pdf2docx_parser.add_argument(
        "-o",
        "--output-dir",
        type=Path,
        default=Path("converted_docx"),
        help="Output folder. Default: ./converted_docx",
    )
    batch_pdf2docx_parser.add_argument(
        "-r",
        "--recursive",
        action="store_true",
        help="Scan subfolders recursively.",
    )
    batch_pdf2docx_parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite existing output files.",
    )

    batch_docx2pdf_parser = subparsers.add_parser(
        "batch-docx2pdf", help="Convert all DOCX files in a folder to PDF."
    )
    batch_docx2pdf_parser.add_argument("input_dir", type=Path, help="Folder containing DOCX files.")
    batch_docx2pdf_parser.add_argument(
        "-o",
        "--output-dir",
        type=Path,
        default=Path("converted_pdf"),
        help="Output folder. Default: ./converted_pdf",
    )
    batch_docx2pdf_parser.add_argument(
        "-r",
        "--recursive",
        action="store_true",
        help="Scan subfolders recursively.",
    )
    batch_docx2pdf_parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite existing output files.",
    )

    return parser.parse_args()


def main() -> int:
    args = parse_args()

    try:
        if args.command == "pdf2docx":
            input_path = validate_input(args.input, ".pdf")
            output_path = args.output or default_output_path(input_path, ".docx")
            pdf_to_docx(input_path, output_path, start=args.start_page, end=args.end_page)
            print(f"Converted PDF -> DOCX: {output_path}")

        elif args.command == "docx2pdf":
            input_path = validate_input(args.input, ".docx")
            output_path = args.output or default_output_path(input_path, ".pdf")
            docx_to_pdf(input_path, output_path)
            print(f"Converted DOCX -> PDF: {output_path}")

        elif args.command == "batch-pdf2docx":
            if not args.input_dir.exists() or not args.input_dir.is_dir():
                raise FileNotFoundError(f"Input directory not found: {args.input_dir}")
            args.output_dir.mkdir(parents=True, exist_ok=True)
            success, failed = batch_pdf_to_docx(
                args.input_dir, args.output_dir, args.recursive, args.overwrite
            )
            print(f"Batch complete. Success: {success}, Failed: {failed}")

        elif args.command == "batch-docx2pdf":
            if not args.input_dir.exists() or not args.input_dir.is_dir():
                raise FileNotFoundError(f"Input directory not found: {args.input_dir}")
            args.output_dir.mkdir(parents=True, exist_ok=True)
            success, failed = batch_docx_to_pdf(
                args.input_dir, args.output_dir, args.recursive, args.overwrite
            )
            print(f"Batch complete. Success: {success}, Failed: {failed}")

        return 0

    except Exception as exc:  # pragma: no cover
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
