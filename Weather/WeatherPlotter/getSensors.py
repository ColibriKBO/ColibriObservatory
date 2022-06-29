import serial
import time
from retrying import retry


time.sleep(2)

@retry
def openSerial():
	try:
		ser = serial.Serial('COM6', 9600)
	except:
		print('Exception ocurred!')
		time.sleep(1)
	finally:
		return ser

ser = serial.Serial('COM6', 9600)
# ser = openSerial()
# Read and record the data
data =[]                       # empty list to store the data
for i in range(50):
    b = ser.readline()         # read a byte string
    string_n = b.decode()  # decode byte string into Unicode  
    string = string_n.rstrip() # remove \n and \r
    # flt = float(string)        # convert string to float
    print(string)
    # data.append(flt)           # add to the end of data list
    time.sleep(0.1)            # wait (sleep) 0.1 seconds

# print(readSensors)

ser.close()
