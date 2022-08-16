import subprocess
import sys
''' Run with python BiasTester.py program_name args
    e.g. python BiasTester.py ColibriGrab.exe -n 50 -p Bias -e 0 -t 0 -f bias -w d:/BiasTests
'''
argProgram = []

if __name__ == "__main__":

	argCount = len(sys.argv)

	for i in range(1, argCount):
		argProgram.append(sys.argv[i])

	for i in range(10):
		subprocess.call(argProgram)
		print('Finished interation %s' % i)