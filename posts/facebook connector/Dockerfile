FROM ubuntu:20.04

# הימנעות מ-interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# התקנת חבילות בסיסיות
RUN apt-get update && apt-get install -y \
    xvfb \
    x11vnc \
    fluxbox \
    wget \
    curl \
    git \
    python3 \
    python3-pip \
    supervisor \
    net-tools \
    && rm -rf /var/lib/apt/lists/*

# התקנת noVNC
RUN git clone https://github.com/novnc/noVNC.git /opt/noVNC \
    && git clone https://github.com/novnc/websockify /opt/noVNC/utils/websockify

# התקנת Google Chrome
RUN wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get install -y google-chrome-stable

# יצירת משתמש
RUN useradd -m -s /bin/bash user && \
    mkdir -p /home/user/.vnc && \
    chown -R user:user /home/user

# העתקת קבצי הגדרה
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY startup.sh /startup.sh
RUN chmod +x /startup.sh

# הגדרת directory עבודה
WORKDIR /home/user

# חשיפת פורטים
EXPOSE 5901 6080

# הרצת supervisor
CMD ["/startup.sh"]
