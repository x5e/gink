from setuptools import setup, find_packages
from pathlib import Path


setup(
    name='gink',
    description='a system for storing data structures in lmdb',
    url='https://github.com/x5e/gink',
    author='Darin McGill',
    author_email="gink@darinmcgill.com",
    classifiers=[
        'Development Status :: 4 - Beta',
        "Intended Audience :: Developers",
        'Programming Language :: Python :: 3',
        'Programming Language :: Python :: 3.8',
        'Programming Language :: Python :: 3.9',
        'Programming Language :: Python :: 3.10',
        'Programming Language :: Python :: 3.11',
        'License :: OSI Approved :: Apache Software License',
    ],
    keywords='gink lmdb crdt history versioned',
    packages=find_packages(),
    python_requires=">=3.8, <4",
    install_requires=[
        "wsproto",
        "sortedcontainers",
        "lmdb",
        "protobuf<=3.20.3",
    ],
    extras_require={
        "test": ["nose2"],
        "lint": ["mypy"],
    },
    license_files=["LICENSE"],
    long_description=(Path(__file__).parent / "README.md").read_text(),
    long_description_content_type='text/markdown'
)
