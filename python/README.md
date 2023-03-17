# Gink in General

Gink aims to be a "protocol first" database system defined by the protocol for syncronizing 
instances, rather than by a specific implementation.  Defining the database in terms of
the interchange format allows for independent implementations to interact seamlessly in 
a well-defined manner.

# This Python Implementation of Gink

I created the python implementation of Gink to be a testbed for new ideas and
to provide the simplest expression of all the concepts in Gink.  Well written python
code can essentially serve as executable psudocode.  Code written for this implementation
has been biased in favor of readability and extensibility, rather than raw performance.
For example, (most of) the code doesn't use async functions or multi-threading. 
