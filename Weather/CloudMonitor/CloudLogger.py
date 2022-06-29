import logging
import ftplib
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
import time, datetime
import os
from socket import *
from scipy import interpolate
from logging.handlers import TimedRotatingFileHandler
from ftpmod import *
from time import sleep

def uploadFileFTP(sourceFile1, sourceFile2, server, username, password):
    ftp = ftplib.FTP(server)
    ftp.login(username, password)
    print('Uploading ' + sourceFile1)
    ftp.storbinary('STOR ' + sourceFile1, open(sourceFile1, 'rb'), 1024)
    print('Uploading ' + sourceFile2)
    ftp.storbinary('STOR ' + sourceFile2, open(sourceFile2, 'rb'), 1024)
    ftp.quit()

def uptimePlot(data, imagedir):
    print('Making total plot...')
    # Arrange the data into blocks and calculate the mean of each block
    t = data[:,0].astype(np.int)
    t = (t-max(t))/(3600.0*24)
    y = data[:,1].astype(np.float)-data[:,2].astype(np.float)

    samplerate = 600/86400 # Should be in fraction of days. 1/86400 = 1 second
    f = interpolate.interp1d(t,y)
    xnew = np.arange(min(t),max(t),samplerate)
    ynew = f(xnew)

    n = int(len(ynew))

    a = ynew[0:(n-1)].reshape(1,1,n-1)
    block = np.mean(a, axis=1)

    plt.figure(figsize = (10,6))
    gs1 = gridspec.GridSpec(2, 1, width_ratios=[1], height_ratios=[1,8])
    gs1.update(wspace=0.025, hspace=0.0) # set the spacing between axes. 

    ax0 = plt.subplot(gs1[0])
    ax0.pcolorfast(block, cmap='Blues_r', vmin=-20, vmax=-10)

    ax0.set_xticklabels([])
    ax0.set_xticks([])
    ax0.set_yticklabels([])
    ax0.set_yticks([])
    plt.title('Cloud Cover', size=20)

    ax1 = plt.subplot(gs1[1])
    ax1.plot(t, y, color='black')
    ax1.axhline(y=-17)

    ax1.set_xlim(min(t), max(t))
    ax1.set_xlabel('Time from Present (days)', size=15)
    ax1.set_ylabel('Sky Temp minus Ground Temp (*C)', size=15)

    plt.savefig(imagedir + 'CloudCover-Up.png', dpi=200)
    print('Save all-time cloud cover to %s' % imagedir)
    plt.close()

def plotLog(logname, imagedir):
    print('Making daily plot...')
    data = pd.read_csv(logname)
    data.columns = ['timestamp','SkyT','GroundT']

    t = data['timestamp']
    y = data['SkyT']-data['GroundT']

    # Convert timestamp to hours and put in a column in data
    data['timeh'] = 99
    
    for i in range(len(data.index)):
        t2 = int(datetime.datetime.fromtimestamp(data['timestamp'][i]).strftime('%H')) + float(datetime.datetime.fromtimestamp(data['timestamp'][i]).strftime('%M'))/60 + float(datetime.datetime.fromtimestamp(data['timestamp'][i]).strftime('%S'))/3600
        data.loc[i,'timeh'] = t2

    # print(datetime.datetime.fromtimestamp(data['timestamp'][10]))
    # print(int(datetime.datetime.fromtimestamp(data['timestamp'][10]).strftime('%H')) + float(datetime.datetime.fromtimestamp(data['timestamp'][10]).strftime('%M'))/60 + float(datetime.datetime.fromtimestamp(data['timestamp'][10]).strftime('%S'))/3600)

    # Arrange the data into blocks and calculate the mean of each block
    # blocksize = 600
    samplerate = 6
    f = interpolate.interp1d(t,y)
    xnew = np.arange(min(data['timestamp']),max(data['timestamp']),samplerate)
    ynew = f(xnew)
    # interval = 1
    n = int(len(ynew))

    a = ynew[0:(n-1)].reshape(1,1,n-1)
    block = np.mean(a, axis=1)

    # Plotting section
    plt.figure(figsize = (10,6))
    gs1 = gridspec.GridSpec(2, 1, width_ratios=[1], height_ratios=[1,8])
    gs1.update(wspace=0.025, hspace=0.0) # set the spacing between axes. 

    ax0 = plt.subplot(gs1[0])
    ax0.pcolorfast(block, cmap='Blues_r', vmin=-20, vmax=-10)

    ax0.set_xticklabels([])
    ax0.set_xticks([])
    ax0.set_yticklabels([])
    ax0.set_yticks([])
    #ax0.set_xlim(1, len(block[0])+1)
    plt.title('Cloud Cover', size=20)

    ax1 = plt.subplot(gs1[1])
    ax1.plot(data['timeh'], y, color='black')

    ax1.set_xlim(min(data['timeh']), max(data['timeh']))
    ax1.set_xlabel('Local Time', size=15)
    ax1.set_ylabel('Sky Temp minus Ground Temp (*C)', size=15)

    plt.savefig(imagedir + 'CloudCover-Today.png', dpi=200)
    print('Saved daily image to %s' % imagedir)
    plt.close()

# def sendEmail():
#     t = time.localtime()
#     nearmidnight = t.tm_hour == 23 and t.tm_min ==59
#     nearnoon = t.tm_hour == 11 and t.tm_min == 59
    
#     if nearmidnight:


def main():
    value_array = np.empty((0,3))

    log_file = "d:\\Logs\\Weather\\CloudMonitor\\current-cloud.log"
    image_dir = "d:\\Logs\\Weather\\Images\\CloudMonitor\\"

    logger = logging.getLogger("Rotating Log")
    logger.setLevel(logging.INFO)
    handler = TimedRotatingFileHandler(log_file, when="midnight", interval=1, backupCount=90)
    logger.addHandler(handler)

    # Setup remote cloud monitor
    address= ( b'10.0.20.10', 8888) #define server IP and port
    client_socket =socket(AF_INET, SOCK_DGRAM) #Set up the Socket
    client_socket.settimeout(5) #Only wait 2 seconds for a response

    # old_log_size = os.path.getsize(log_file)

    cnt = 0
    try:
        log_size = os.path.getsize(log_file)
        old_log_size = log_size
    except:
        log_size = 0
        old_log_size = log_size

    while(1):
        req_data = b'All' # Request all data
        # client_socket.sendto( req_data, address) # Send the data request
        try:
            client_socket.sendto( req_data, address) # Send the data request
            rec_data, addr = client_socket.recvfrom(2048) # Read the response from arduino
            write_buffer = str(int(time.time())) + ' ' + str(rec_data, 'utf-8') # Format string with Unix time and rec_data
            value_array = np.append(value_array, [write_buffer.split()], axis=0) # Append data to an array for plotting
            print('Time: ' + str(value_array[cnt,0]) + '   Sky T: ' + str(value_array[cnt,1]) + '   Gnd T: ' + str(value_array[cnt,2]) + '  Delta T: ' + str('%.2f' % (float(value_array[cnt,1]) - float(value_array[cnt,2]))))
            # writer.writerow(write_buffer.split()) # Append data to csv file

            logger.info(str(value_array[cnt,0]) + ',' + str(value_array[cnt,1]) + ',' + str(value_array[cnt,2]))
            # print(value_array[cnt,1])

            log_size = os.path.getsize(log_file)
            print('Log file size is: %s' % str(log_size))
            print('Old log file was: %s' % str(old_log_size))
            if log_size < old_log_size:
                os.rename(image_dir + "CloudCover-Today.png", image_dir + "CloudCover-" + (datetime.datetime.now()-datetime.timedelta(1)).strftime("%Y%m%d") + ".png")
                print('Moved cloud cover image.')

            print('Plotting...')
            old_log_size = log_size

            cnt += 1

            if cnt % 4 == 0:
                uptimePlot(value_array, image_dir)

            if cnt % 8 == 0:
                plotLog(log_file, image_dir)
                # uploadFileFTP(image_dir + 'CloudCover-Today.png', image_dir + 'CloudCover-Up.png', server, username, password)

            # sendEmail()
        except:
            pass

        sleep(30) #delay before sending next command

    # f.close()

if __name__ == "__main__":
    main()