from setuptools import setup, find_packages

setup(
    name='gink',
    version='0.20221231',
    description='a system for storing data structures in lmdb',
    url='https://github.com/google/gink',
    author='Darin McGill',
    classifiers=[  # Optional
        # How mature is this project? Common values are
        #   3 - Alpha
        #   4 - Beta
        #   5 - Production/Stable
        'Development Status :: 3 - Alpha',
        'Programming Language :: Python :: 3.9',
    ],
    keywords='gink lmdb crdt history versioned',
    packages=['gink'],  
)
